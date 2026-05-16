<?php

namespace App\Console\Commands;

use App\Models\SiteCredential;
use App\Models\SiteCredentialField;
use App\Services\CredentialEncryptionService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class VaultRotateKeyCommand extends Command
{
    protected $signature = 'vault:rotate-key {--new-key= : The new 64-character hex key}';
    protected $description = 'Re-encrypt all vault fields with a new master key';

    public function handle(): int
    {
        $newKey = $this->option('new-key');
        
        if (!$newKey || strlen($newKey) !== 64 || !ctype_xdigit($newKey)) {
            $this->error('--new-key must be a 64-character hexadecimal string.');
            return Command::FAILURE;
        }

        $encryptionService = app(CredentialEncryptionService::class);

        $this->info('Starting vault key rotation...');

        DB::transaction(function () use ($encryptionService, $newKey) {
            // Re-encrypt sensitive credential fields
            $fields = SiteCredentialField::where('is_sensitive', true)->cursor();
            $fieldCount = 0;
            
            foreach ($fields as $field) {
                $field->field_value = $encryptionService->reEncrypt($field->field_value, $newKey);
                $field->save();
                $fieldCount++;
            }
            
            $this->info("Re-encrypted {$fieldCount} sensitive fields.");

            // Re-encrypt credential notes
            $credentials = SiteCredential::whereNotNull('notes')->cursor();
            $noteCount = 0;
            
            foreach ($credentials as $credential) {
                $credential->notes = $encryptionService->reEncrypt($credential->notes, $newKey);
                $credential->save();
                $noteCount++;
            }
            
            $this->info("Re-encrypted {$noteCount} credential notes.");
        });

        $this->newLine();
        $this->warn('IMPORTANT: Update your .env file with the new VAULT_MASTER_KEY:');
        $this->line("VAULT_MASTER_KEY={$newKey}");
        $this->warn('Then restart your application for the new key to take effect.');

        return Command::SUCCESS;
    }
}
