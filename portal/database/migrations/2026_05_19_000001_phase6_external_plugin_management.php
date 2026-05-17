<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ─── 1. Extend site_plugins table ───────────────────────────────────

        // Make plugin_id nullable (was required, only for internal plugins)
        DB::statement('ALTER TABLE site_plugins ALTER COLUMN plugin_id DROP NOT NULL');

        // Drop existing unique constraint on (site_id, plugin_id)
        Schema::table('site_plugins', function (Blueprint $table) {
            $table->dropUnique(['site_id', 'plugin_id']);
        });

        // Drop foreign key on plugin_id so it can be nullable properly
        Schema::table('site_plugins', function (Blueprint $table) {
            $table->dropForeign(['plugin_id']);
        });

        // Add new columns
        Schema::table('site_plugins', function (Blueprint $table) {
            $table->string('plugin_slug', 255)->nullable()->after('plugin_id');
            $table->string('plugin_name', 500)->nullable()->after('plugin_slug');
            $table->string('plugin_file', 500)->nullable()->after('plugin_name');
            $table->enum('plugin_type', ['internal', 'wporg', 'premium'])->default('wporg')->after('plugin_file');
            $table->boolean('update_available')->default(false)->after('is_active');

            $table->index('plugin_slug');
            $table->index('plugin_type');
        });

        // Data migration: populate plugin_slug from existing plugin relationships
        DB::statement("
            UPDATE site_plugins
            SET plugin_slug = plugins.slug,
                plugin_name = plugins.name,
                plugin_type = 'internal'
            FROM plugins
            WHERE plugins.id = site_plugins.plugin_id
              AND site_plugins.plugin_id IS NOT NULL
        ");

        // Now add unique constraint on (site_id, plugin_slug)
        Schema::table('site_plugins', function (Blueprint $table) {
            $table->unique(['site_id', 'plugin_slug']);
        });

        // ─── 2. Extend deployment_jobs table ────────────────────────────────

        // Make plugin_version_id nullable (was required, only for internal plugins)
        DB::statement('ALTER TABLE deployment_jobs ALTER COLUMN plugin_version_id DROP NOT NULL');

        // Drop foreign key so column can be nullable
        Schema::table('deployment_jobs', function (Blueprint $table) {
            $table->dropForeign(['plugin_version_id']);
        });

        // Widen job_type column from 20 to 50 characters (added by prior migration)
        DB::statement('ALTER TABLE deployment_jobs ALTER COLUMN job_type TYPE varchar(50)');

        // Add new columns for external plugin operations
        Schema::table('deployment_jobs', function (Blueprint $table) {
            $table->string('plugin_slug', 255)->nullable()->after('job_type');
            $table->string('plugin_name', 500)->nullable()->after('plugin_slug');
            $table->string('target_version', 50)->nullable()->after('plugin_name');
            $table->string('download_url', 1000)->nullable()->after('target_version');
            $table->string('file_hash', 64)->nullable()->after('download_url');

            $table->index('job_type');
        });

        // ─── 3. Create external_plugins_cache table ─────────────────────────

        Schema::create('external_plugins_cache', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 255)->unique();
            $table->string('name', 500)->nullable();
            $table->string('author', 255)->nullable();
            $table->string('latest_version', 50)->nullable();
            $table->string('download_url', 1000)->nullable();
            $table->string('latest_file_hash', 64)->nullable();
            $table->string('requires_wp', 20)->nullable();
            $table->string('tested_up_to', 20)->nullable();
            $table->decimal('rating', 3, 2)->nullable();
            $table->string('active_installs', 20)->nullable();
            $table->timestamp('last_updated_wporg')->nullable();
            $table->boolean('is_on_wporg')->default(true);
            $table->boolean('is_abandoned')->default(false);
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();

            $table->index('is_on_wporg');
            $table->index('is_abandoned');
        });

        // ─── 4. Create plugin_operation_logs table ──────────────────────────

        Schema::create('plugin_operation_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->constrained()->cascadeOnDelete();
            $table->string('plugin_slug', 255);
            $table->string('plugin_name', 500)->nullable();
            $table->enum('operation', ['activate', 'deactivate']);
            $table->enum('status', ['success', 'failed']);
            $table->text('error_message')->nullable();
            $table->foreignId('performed_by')->nullable()->constrained('users');
            $table->timestamp('performed_at')->nullable();

            $table->index(['site_id', 'plugin_slug']);
        });
    }

    public function down(): void
    {
        // Drop new tables
        Schema::dropIfExists('plugin_operation_logs');
        Schema::dropIfExists('external_plugins_cache');

        // Remove new columns from deployment_jobs
        Schema::table('deployment_jobs', function (Blueprint $table) {
            $table->dropIndex(['job_type']);
            $table->dropColumn([
                'plugin_slug',
                'plugin_name',
                'target_version',
                'download_url',
                'file_hash',
            ]);
        });

        // Revert job_type column width back to 20
        DB::statement('ALTER TABLE deployment_jobs ALTER COLUMN job_type TYPE varchar(20)');

        // Restore plugin_version_id as non-nullable with foreign key
        DB::statement('ALTER TABLE deployment_jobs ALTER COLUMN plugin_version_id SET NOT NULL');
        Schema::table('deployment_jobs', function (Blueprint $table) {
            $table->foreign('plugin_version_id')->references('id')->on('plugin_versions');
        });

        // Remove new columns from site_plugins and restore constraints
        Schema::table('site_plugins', function (Blueprint $table) {
            $table->dropUnique(['site_id', 'plugin_slug']);
            $table->dropIndex(['plugin_slug']);
            $table->dropIndex(['plugin_type']);
            $table->dropColumn([
                'plugin_slug',
                'plugin_name',
                'plugin_file',
                'plugin_type',
                'update_available',
            ]);
        });

        // Restore plugin_id as non-nullable with foreign key and unique constraint
        DB::statement('ALTER TABLE site_plugins ALTER COLUMN plugin_id SET NOT NULL');
        Schema::table('site_plugins', function (Blueprint $table) {
            $table->foreign('plugin_id')->references('id')->on('plugins')->cascadeOnDelete();
            $table->unique(['site_id', 'plugin_id']);
        });
    }
};
