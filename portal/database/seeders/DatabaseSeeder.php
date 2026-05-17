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

        // Create default admin user (credentials sourced from env, never committed)
        $adminEmail = env('SEED_ADMIN_EMAIL');
        $adminPassword = env('SEED_ADMIN_PASSWORD');

        if (empty($adminEmail) || empty($adminPassword)) {
            throw new \RuntimeException(
                'SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in .env before seeding.'
            );
        }

        $admin = User::firstOrCreate(
            ['email' => $adminEmail],
            [
                'name' => env('SEED_ADMIN_NAME', 'Admin'),
                'password' => Hash::make($adminPassword),
                'role' => 'admin',
                'is_active' => true,
                'email_verified_at' => now(),
            ]
        );
        $admin->assignRole('admin');

        // Create default portal settings. portal_base_url is the address WP
        // sites use to call the backend, so it must be reachable from THEIR
        // network — keep it in env, not hardcoded.
        $settings = [
            'telegram_bot_token' => env('TELEGRAM_BOT_TOKEN', ''),
            'telegram_default_chat_id' => env('TELEGRAM_CHAT_ID', ''),
            'portal_base_url' => env('PORTAL_BASE_URL', env('APP_URL', 'http://localhost:8000')),
            'agent_ping_interval_minutes' => env('AGENT_PING_INTERVAL_MINUTES', '5'),
            'max_deployment_retries' => env('MAX_DEPLOYMENT_RETRIES', '3'),
            // Phase 6 — company plugin prefixes used by PluginClassificationService.
            // Stored as a JSON array of slug prefixes; any agent-reported slug
            // starting with one of these AND present in the `plugins` registry
            // is classified as internal.
            'company_plugin_prefixes' => json_encode(['epos-', 'zippy-']),
            // Phase 7 — Orders Management
            'orders_per_site_limit' => env('ORDERS_PER_SITE_LIMIT', '200'),
            'order_spike_enabled' => env('ORDER_SPIKE_ENABLED', 'true'),
            'order_spike_threshold_hourly' => env('ORDER_SPIKE_THRESHOLD_HOURLY', '50'),
            'order_spike_threshold_burst' => env('ORDER_SPIKE_THRESHOLD_BURST', '20'),
        ];

        foreach ($settings as $key => $value) {
            \App\Models\PortalSetting::firstOrCreate(
                ['key' => $key],
                ['value' => $value]
            );
        }

        $this->call(CredentialTypeSeeder::class);

        // Register the known Zippy company plugins. The classification service
        // treats a slug as "internal" only when it matches a company prefix AND
        // has a row in this table — so the prefix list alone isn't enough.
        $zippyPlugins = [
            ['slug' => 'zippy-crm',  'name' => 'Zippy CRM'],
            ['slug' => 'zippy-pay',  'name' => 'Zippy Pay'],
            ['slug' => 'zippy-core', 'name' => 'Zippy Core'],
        ];
        foreach ($zippyPlugins as $p) {
            \App\Models\Plugin::firstOrCreate(
                ['slug' => $p['slug']],
                [
                    'name'       => $p['name'],
                    'is_active'  => true,
                    'created_by' => $admin->id,
                ]
            );
        }
    }
}
