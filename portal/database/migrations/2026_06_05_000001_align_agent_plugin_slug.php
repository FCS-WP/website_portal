<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // The agent reports get_plugins() keyed by folder name (`epos-wp-agent`)
        // but the seeded Plugin row used `wp-portal-agent`. Misalignment caused
        // SitePluginIngestService to leave plugin_id null and the Installed
        // Sites count to read 0 on the plugin detail page.
        $renamed = DB::table('plugins')
            ->where('slug', 'wp-portal-agent')
            ->update(['slug' => 'epos-wp-agent', 'updated_at' => now()]);

        if ($renamed > 0) {
            $plugin = DB::table('plugins')->where('slug', 'epos-wp-agent')->first();
            if ($plugin) {
                DB::table('site_plugins')
                    ->where('plugin_slug', 'epos-wp-agent')
                    ->whereNull('plugin_id')
                    ->update([
                        'plugin_id'   => $plugin->id,
                        'plugin_type' => 'internal',
                    ]);
            }
        }
    }

    public function down(): void
    {
        DB::table('plugins')
            ->where('slug', 'epos-wp-agent')
            ->update(['slug' => 'wp-portal-agent', 'updated_at' => now()]);
    }
};
