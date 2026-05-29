<?php

namespace App\Console\Commands;

use App\Models\Hosting;
use App\Models\Site;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ImportSitesCommand extends Command
{
    protected $signature = 'import:sites {file : Path to CSV file}';

    protected $description = 'Bulk-import hostings and sites from a CSV file. Required columns: hosting, name, url. Optional hosting columns: hosting_provider, hosting_note, hosting_ip, hosting_username, hosting_password, hosting_panel_url. Optional site columns: description, tags, wp_version, php_version, woo_active, is_beta_tester, status. Generates API keys and writes them to storage/app/import_results.csv.';

    /**
     * Required CSV columns. The header row must contain at least these,
     * order-independent and case-insensitive.
     */
    private const REQUIRED_COLUMNS = ['hosting', 'name', 'url'];

    /**
     * Optional hosting columns recognised in the CSV header. Any other
     * unrecognised columns are accepted but ignored.
     */
    private const OPTIONAL_HOSTING_COLUMNS = [
        'hosting_provider',
        'hosting_note',
        'hosting_ip',
        'hosting_username',
        'hosting_password',
        'hosting_panel_url',
    ];

    /**
     * Optional site columns recognised in the CSV header. Any other
     * unrecognised columns are accepted but ignored.
     */
    private const OPTIONAL_SITE_COLUMNS = [
        'description',
        'tags',
        'wp_version',
        'php_version',
        'woo_active',
        'is_beta_tester',
        'status',
    ];

    /**
     * Allowed values for the sites.status enum.
     */
    private const SITE_STATUSES = ['pending', 'connected', 'disconnected'];

    public function handle(): int
    {
        $file = $this->argument('file');

        if (!is_file($file) || !is_readable($file)) {
            $this->error("CSV file not found or unreadable: {$file}");
            return Command::FAILURE;
        }

        // Sites and hostings both have NOT NULL `created_by` referencing
        // users(id). When importing from the CLI there is no authenticated
        // user, so fall back to the first admin (or any user) on the system.
        $creatorId = User::query()
            ->where('role', 'admin')
            ->where('is_active', true)
            ->orderBy('id')
            ->value('id')
            ?? User::query()->orderBy('id')->value('id');

        if (!$creatorId) {
            $this->error('No users exist in the system. Create an admin user before importing.');
            return Command::FAILURE;
        }

        // ---- Read & validate CSV ------------------------------------------------
        $rows = $this->readCsv($file);
        if ($rows === null) {
            return Command::FAILURE;
        }

        if (empty($rows)) {
            $this->warn('CSV contains no data rows. Nothing to import.');
            return Command::SUCCESS;
        }

        $this->info(sprintf('Loaded %d data row(s) from %s', count($rows), $file));

        // ---- Pass 1: collect unique hostings and their optional fields ---------
        // We use the FIRST occurrence of a hosting name to seed any optional
        // attributes (provider, note, credentials, panel_url, etc.).
        $hostingAttrs = []; // name => [attribute array]
        foreach ($rows as $row) {
            $h = trim((string) ($row['hosting'] ?? ''));
            if ($h === '' || isset($hostingAttrs[$h])) {
                continue;
            }
            $hostingAttrs[$h] = $this->extractHostingAttributes($row);
        }

        $this->info(sprintf('Pass 1: ensuring %d unique hosting(s)...', count($hostingAttrs)));

        $hostingMap = [];     // name => id
        $hostingsCreated = 0;
        $sitesImported = 0;
        $sitesSkipped = 0;
        $results = [];        // rows written to import_results.csv

        try {
            DB::transaction(function () use (
                $rows,
                $hostingAttrs,
                $creatorId,
                &$hostingMap,
                &$hostingsCreated,
                &$sitesImported,
                &$sitesSkipped,
                &$results
            ) {
                foreach ($hostingAttrs as $name => $attrs) {
                    $existing = Hosting::where('name', $name)->first();
                    if ($existing) {
                        $hostingMap[$name] = $existing->id;
                        continue;
                    }

                    $payload = array_merge([
                        'name'       => $name,
                        'provider'   => 'other',
                        'created_by' => $creatorId,
                    ], $attrs);

                    $hosting = Hosting::create($payload);
                    $hostingMap[$name] = $hosting->id;
                    $hostingsCreated++;
                }

                // ---- Pass 2: import sites -------------------------------------
                $bar = $this->output->createProgressBar(count($rows));
                $bar->setFormat(' %current%/%max% [%bar%] %percent:3s%% %message%');
                $bar->setMessage('Importing sites...');
                $bar->start();

                foreach ($rows as $i => $row) {
                    $rowNum = $i + 2; // +1 for 0-index, +1 for header
                    $name = trim((string) ($row['name'] ?? ''));
                    $url  = trim((string) ($row['url']  ?? ''));
                    $hostingName = trim((string) ($row['hosting'] ?? ''));

                    if ($name === '' || $url === '' || $hostingName === '') {
                        $sitesSkipped++;
                        $results[] = [
                            'name'    => $name,
                            'url'     => $url,
                            'hosting' => $hostingName,
                            'api_key' => '',
                            'status'  => "skipped: missing required field (row {$rowNum})",
                        ];
                        $bar->advance();
                        continue;
                    }

                    if (!filter_var($url, FILTER_VALIDATE_URL)) {
                        $sitesSkipped++;
                        $results[] = [
                            'name'    => $name,
                            'url'     => $url,
                            'hosting' => $hostingName,
                            'api_key' => '',
                            'status'  => "skipped: malformed URL (row {$rowNum})",
                        ];
                        $bar->advance();
                        continue;
                    }

                    if (Site::where('url', $url)->exists()) {
                        $sitesSkipped++;
                        $results[] = [
                            'name'    => $name,
                            'url'     => $url,
                            'hosting' => $hostingName,
                            'api_key' => '',
                            'status'  => 'skipped: duplicate URL',
                        ];
                        $bar->advance();
                        continue;
                    }

                    $hostingId = $hostingMap[$hostingName] ?? null;
                    if (!$hostingId) {
                        $sitesSkipped++;
                        $results[] = [
                            'name'    => $name,
                            'url'     => $url,
                            'hosting' => $hostingName,
                            'api_key' => '',
                            'status'  => "skipped: hosting not resolved (row {$rowNum})",
                        ];
                        $bar->advance();
                        continue;
                    }

                    // Same generation pattern as SiteController::store —
                    // 64-char random key, SHA256 hash for lookup, encrypted
                    // copy so the agent key can be recovered later.
                    $plainKey  = Str::random(64);
                    $hashedKey = hash('sha256', $plainKey);

                    $payload = array_merge([
                        'hosting_id'        => $hostingId,
                        'name'              => $name,
                        'url'               => $url,
                        'api_secret_key'    => $hashedKey,
                        'api_key_encrypted' => encrypt($plainKey),
                        'status'            => 'pending',
                        'created_by'        => $creatorId,
                    ], $this->extractSiteAttributes($row));

                    Site::create($payload);

                    $sitesImported++;
                    $results[] = [
                        'name'    => $name,
                        'url'     => $url,
                        'hosting' => $hostingName,
                        'api_key' => $plainKey,
                        'status'  => 'imported',
                    ];

                    $bar->advance();
                }

                $bar->finish();
                $this->newLine();
            });
        } catch (\Throwable $e) {
            $this->error('Import failed and was rolled back: ' . $e->getMessage());
            return Command::FAILURE;
        }

        // ---- Write results CSV --------------------------------------------------
        $resultsPath = $this->writeResultsCsv($results);

        // ---- Summary ------------------------------------------------------------
        $this->newLine();
        $this->info('Import complete.');
        $this->line("  • Hostings created : {$hostingsCreated}");
        $this->line("  • Sites imported   : {$sitesImported}");
        $this->line("  • Sites skipped    : {$sitesSkipped}");
        $this->line("  • Results file     : {$resultsPath}");
        $this->warn('Plain API keys are written to the results file ONCE — store it safely and delete after use.');

        return Command::SUCCESS;
    }

    /**
     * Read a CSV file into an array of associative rows keyed by lower-cased
     * header names. Returns null on validation failure (and prints the error).
     *
     * Unknown columns are preserved in the row arrays but ignored downstream.
     *
     * @return array<int, array<string, string>>|null
     */
    private function readCsv(string $file): ?array
    {
        $handle = fopen($file, 'r');
        if ($handle === false) {
            $this->error("Could not open CSV file: {$file}");
            return null;
        }

        try {
            $header = fgetcsv($handle);
            if ($header === false || $header === null) {
                $this->error('CSV is empty (no header row).');
                return null;
            }

            $header = array_map(
                fn ($h) => strtolower(trim((string) $h)),
                $header
            );

            // Strip BOM from first header cell, if present.
            if (isset($header[0])) {
                $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', $header[0]);
            }

            $missing = array_diff(self::REQUIRED_COLUMNS, $header);
            if (!empty($missing)) {
                $this->error('CSV is missing required column(s): ' . implode(', ', $missing));
                return null;
            }

            $rows = [];
            while (($data = fgetcsv($handle)) !== false) {
                // fgetcsv returns [null] for blank lines — skip them.
                if ($data === [null] || (count($data) === 1 && trim((string) $data[0]) === '')) {
                    continue;
                }

                // Pad/truncate to header length so array_combine never fails.
                $data = array_pad(array_slice($data, 0, count($header)), count($header), '');
                $rows[] = array_combine($header, $data);
            }

            return $rows;
        } finally {
            fclose($handle);
        }
    }

    /**
     * Extract optional hosting attributes from a CSV row, dropping any empty
     * values so we never write empty strings to the database.
     *
     * @param array<string, string> $row
     * @return array<string, mixed>
     */
    private function extractHostingAttributes(array $row): array
    {
        $map = [
            'hosting_provider'  => 'provider',
            'hosting_note'      => 'note',
            'hosting_ip'        => 'ip_address',
            'hosting_username'  => 'username',
            'hosting_password'  => 'password_encrypted',
            'hosting_panel_url' => 'panel_url',
        ];

        $attrs = [];
        foreach ($map as $csvKey => $modelKey) {
            if (!array_key_exists($csvKey, $row)) {
                continue;
            }
            $value = trim((string) $row[$csvKey]);
            if ($value === '') {
                continue;
            }
            $attrs[$modelKey] = $value;
        }

        return $attrs;
    }

    /**
     * Extract optional site attributes from a CSV row. Empty cells are
     * dropped, booleans are normalised, tags are split into an array and
     * unknown status values are ignored so the model default applies.
     *
     * @param array<string, string> $row
     * @return array<string, mixed>
     */
    private function extractSiteAttributes(array $row): array
    {
        $attrs = [];

        foreach (['description', 'wp_version', 'php_version'] as $key) {
            if (!array_key_exists($key, $row)) {
                continue;
            }
            $value = trim((string) $row[$key]);
            if ($value === '') {
                continue;
            }
            $attrs[$key] = $value;
        }

        if (array_key_exists('tags', $row)) {
            $raw = trim((string) $row['tags']);
            if ($raw !== '') {
                // Allow either pipe- or comma-separated tag lists.
                $separator = str_contains($raw, '|') ? '|' : ',';
                $tags = array_values(array_filter(
                    array_map('trim', explode($separator, $raw)),
                    fn ($t) => $t !== ''
                ));
                if (!empty($tags)) {
                    $attrs['tags'] = $tags;
                }
            }
        }

        foreach (['woo_active', 'is_beta_tester'] as $key) {
            if (!array_key_exists($key, $row)) {
                continue;
            }
            $value = trim((string) $row[$key]);
            if ($value === '') {
                continue;
            }
            $bool = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($bool !== null) {
                $attrs[$key] = $bool;
            }
        }

        if (array_key_exists('status', $row)) {
            $status = strtolower(trim((string) $row['status']));
            if ($status !== '' && in_array($status, self::SITE_STATUSES, true)) {
                $attrs['status'] = $status;
            }
        }

        return $attrs;
    }

    /**
     * Write the result rows to storage/app/import_results.csv and return the
     * absolute path so the operator can find it easily.
     *
     * @param array<int, array{name:string,url:string,hosting:string,api_key:string,status:string}> $results
     */
    private function writeResultsCsv(array $results): string
    {
        $relative = 'import_results.csv';

        $buffer = fopen('php://temp', 'r+');
        fputcsv($buffer, ['name', 'url', 'hosting', 'api_key', 'status']);
        foreach ($results as $row) {
            fputcsv($buffer, [
                $row['name']    ?? '',
                $row['url']     ?? '',
                $row['hosting'] ?? '',
                $row['api_key'] ?? '',
                $row['status']  ?? '',
            ]);
        }
        rewind($buffer);
        $contents = stream_get_contents($buffer);
        fclose($buffer);

        Storage::disk('local')->put($relative, $contents);

        return Storage::disk('local')->path($relative);
    }
}
