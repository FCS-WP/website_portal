<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Symfony\Component\Process\Process;

/**
 * Daily backup of the Postgres database + Laravel private storage.
 *
 * Writes to `./backups/YYYY-MM-DD/` on the host (mounted into the container
 * at /var/www/portal/../backups). Each run produces:
 *   - epos_portal.sql.gz   pg_dump --format=plain | gzip
 *   - storage.tar.gz       tarball of storage/app/private/ (plugin zips, etc.)
 *
 * After writing, prunes directories older than the configured retention
 * window (default 14 days). The Make `restore` target reads these back.
 *
 * Designed to run inside the existing epos-app container — pg_dump is in
 * PATH after the Dockerfile change. No docker socket needed.
 */
class DatabaseBackup extends Command
{
    protected $signature = 'db:backup
        {--retention=14 : Days of backups to keep on disk}
        {--skip-storage : Skip the storage/ tarball (faster, DB only)}';

    protected $description = 'Dump the database + private storage to ./backups/<date>/.';

    public function handle(): int
    {
        $date = Carbon::now()->format('Y-m-d');

        // Write under portal/backups/ rather than the repo root. Only the
        // `portal/` directory is bind-mounted into the epos-app container
        // (at /var/www/portal/), so a repo-root path would write inside
        // the container and be lost on rebuild. Make targets symlink or
        // reference portal/backups/ from the host as ./backups/.
        $backupRoot = base_path('backups');
        $dir = $backupRoot . '/' . $date;

        if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
            $this->error("Failed to create backup directory: $dir");
            return self::FAILURE;
        }

        $this->info("Backing up to: $dir");

        // ── 1. DB dump ─────────────────────────────────────────────────
        $dbName     = config('database.connections.pgsql.database');
        $dbUser     = config('database.connections.pgsql.username');
        $dbPassword = config('database.connections.pgsql.password');
        $dbHost     = config('database.connections.pgsql.host');
        $dbPort     = config('database.connections.pgsql.port', 5432);

        if (!$dbName || !$dbUser || !$dbHost) {
            $this->error('Database config is incomplete; aborting.');
            return self::FAILURE;
        }

        $dumpPath = $dir . '/' . $dbName . '.sql.gz';

        // pg_dump piped through gzip. -Fp = plain SQL (portable, gzip
        // already compresses well). PGPASSWORD via env to avoid putting
        // the password in the process list.
        $shell = sprintf(
            'pg_dump -h %s -p %s -U %s -d %s -Fp --no-owner --no-acl | gzip -9 > %s',
            escapeshellarg($dbHost),
            escapeshellarg((string) $dbPort),
            escapeshellarg($dbUser),
            escapeshellarg($dbName),
            escapeshellarg($dumpPath)
        );

        $process = Process::fromShellCommandline($shell, null, [
            'PGPASSWORD' => $dbPassword,
        ], null, 600);
        $process->run();

        if (!$process->isSuccessful()) {
            $this->error('pg_dump failed: ' . $process->getErrorOutput());
            @unlink($dumpPath);
            return self::FAILURE;
        }

        $dumpSize = is_file($dumpPath) ? filesize($dumpPath) : 0;
        $this->line(sprintf('  ✓ DB dump: %s (%s)', basename($dumpPath), $this->humanBytes($dumpSize)));

        // ── 2. Storage tarball ─────────────────────────────────────────
        if (!$this->option('skip-storage')) {
            $storagePath = storage_path('app/private');
            if (is_dir($storagePath)) {
                $tarPath = $dir . '/storage.tar.gz';
                $tarCmd = sprintf(
                    'tar -czf %s -C %s .',
                    escapeshellarg($tarPath),
                    escapeshellarg($storagePath)
                );
                $tar = Process::fromShellCommandline($tarCmd, null, null, null, 600);
                $tar->run();
                if ($tar->isSuccessful()) {
                    $tarSize = is_file($tarPath) ? filesize($tarPath) : 0;
                    $this->line(sprintf('  ✓ storage: %s (%s)', basename($tarPath), $this->humanBytes($tarSize)));
                } else {
                    // Non-fatal — DB is the critical piece. Log and continue.
                    $this->warn('storage tarball failed (continuing): ' . $tar->getErrorOutput());
                }
            }
        }

        // ── 3. Manifest ────────────────────────────────────────────────
        // A small text file so a human (or a restore script) can verify
        // contents without unpacking.
        file_put_contents($dir . '/MANIFEST.txt', sprintf(
            "EPOS Portal backup\n" .
            "Created: %s\n" .
            "DB:      %s (size on disk: %s)\n" .
            "Storage: %s\n" .
            "Restore: make restore DATE=%s\n",
            Carbon::now()->toIso8601String(),
            $dbName,
            $this->humanBytes($dumpSize),
            $this->option('skip-storage') ? 'skipped' : 'included',
            $date
        ));

        // ── 4. Prune ───────────────────────────────────────────────────
        $retention = max(1, (int) $this->option('retention'));
        $cutoff = Carbon::now()->subDays($retention);
        $pruned = 0;
        foreach (glob($backupRoot . '/*', GLOB_ONLYDIR) ?: [] as $existingDir) {
            $basename = basename($existingDir);
            // Only prune directories that look like YYYY-MM-DD.
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $basename)) {
                continue;
            }
            try {
                $dirDate = Carbon::createFromFormat('Y-m-d', $basename);
            } catch (\Throwable $e) {
                continue;
            }
            if ($dirDate->lt($cutoff)) {
                $this->rrmdir($existingDir);
                $pruned++;
            }
        }
        if ($pruned > 0) {
            $this->line("  ✓ Pruned $pruned backup(s) older than $retention days");
        }

        $this->info("Backup complete.");
        return self::SUCCESS;
    }

    private function rrmdir(string $dir): void
    {
        if (!is_dir($dir)) return;
        foreach (scandir($dir) as $entry) {
            if ($entry === '.' || $entry === '..') continue;
            $path = $dir . '/' . $entry;
            is_dir($path) ? $this->rrmdir($path) : @unlink($path);
        }
        @rmdir($dir);
    }

    private function humanBytes(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB'];
        $i = 0;
        $size = (float) $bytes;
        while ($size >= 1024 && $i < count($units) - 1) {
            $size /= 1024;
            $i++;
        }
        return sprintf('%.1f %s', $size, $units[$i]);
    }
}
