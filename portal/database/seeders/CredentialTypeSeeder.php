<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\CredentialType;

class CredentialTypeSeeder extends Seeder
{
    public function run(): void
    {
        $types = [
            ['name' => 'WordPress', 'slug' => 'wordpress', 'icon' => 'brand-wordpress', 'sort_order' => 1],
            ['name' => 'Hosting', 'slug' => 'hosting', 'icon' => 'server', 'sort_order' => 2],
            ['name' => 'FTP / SFTP', 'slug' => 'ftp', 'icon' => 'folders', 'sort_order' => 3],
            ['name' => 'Database', 'slug' => 'database', 'icon' => 'database', 'sort_order' => 4],
            ['name' => 'Custom', 'slug' => 'custom', 'icon' => 'key', 'sort_order' => 5],
        ];

        foreach ($types as $type) {
            CredentialType::firstOrCreate(
                ['slug' => $type['slug']],
                $type
            );
        }
    }
}
