<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Role;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Create roles
        Role::firstOrCreate(['name' => 'admin']);
        Role::firstOrCreate(['name' => 'dev']);
        Role::firstOrCreate(['name' => 'mkt']);

        // Create default admin user
        $admin = User::firstOrCreate(
            ['email' => 'admin@epos.com'],
            [
                'name' => 'Admin',
                'password' => Hash::make('password'),
                'role' => 'admin',
                'is_active' => true,
                'email_verified_at' => now(),
            ]
        );
        $admin->assignRole('admin');

        // Create default portal settings
        $settings = [
            'telegram_bot_token' => '',
            'telegram_default_chat_id' => '',
            'portal_base_url' => 'http://localhost:8081',
            'agent_ping_interval_minutes' => '5',
            'max_deployment_retries' => '3',
        ];

        foreach ($settings as $key => $value) {
            \App\Models\PortalSetting::firstOrCreate(
                ['key' => $key],
                ['value' => $value]
            );
        }

        $this->call(CredentialTypeSeeder::class);
    }
}
