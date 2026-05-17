<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. vulnerability_definitions
        Schema::create('vulnerability_definitions', function (Blueprint $table) {
            $table->id();
            $table->string('source_id', 100)->unique();
            $table->string('plugin_slug', 255)->index();
            $table->string('plugin_name', 255)->nullable();
            $table->text('affected_versions'); // JSON array of version ranges
            $table->string('fixed_in_version', 50)->nullable();
            $table->string('cve_id', 50)->nullable();
            $table->text('title');
            $table->text('description')->nullable();
            $table->enum('severity', ['critical', 'high', 'medium', 'low', 'info'])->index();
            $table->decimal('cvss_score', 3, 1)->nullable();
            $table->string('source', 50)->default('wordfence');
            $table->timestamp('published_at')->nullable();
            $table->timestamp('last_synced_at');
            $table->timestamps();
        });

        // 2. site_vulnerabilities
        Schema::create('site_vulnerabilities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->constrained('sites')->cascadeOnDelete();
            $table->foreignId('vulnerability_id')->constrained('vulnerability_definitions');
            $table->string('plugin_slug', 255);
            $table->string('installed_version', 50);
            $table->enum('status', ['open', 'patched', 'acknowledged'])->default('open');
            $table->timestamp('first_detected_at');
            $table->timestamp('last_seen_at');
            $table->timestamp('patched_at')->nullable();
            $table->foreignId('acknowledged_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('acknowledged_at')->nullable();
            $table->text('acknowledgment_note')->nullable();
            $table->timestamp('acknowledgment_expires_at')->nullable();

            $table->unique(['site_id', 'vulnerability_id']);
            $table->index(['site_id', 'status']);
        });

        // 3. file_integrity_baselines
        Schema::create('file_integrity_baselines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->unique()->constrained('sites')->cascadeOnDelete();
            $table->longText('file_hashes'); // JSON map
            $table->integer('file_count');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // 11. security_scan_runs (created before file_integrity_findings due to FK dependency)
        Schema::create('security_scan_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->constrained('sites')->cascadeOnDelete();
            $table->enum('scan_type', ['file_integrity', 'vulnerability', 'user_audit', 'full']);
            $table->enum('status', ['running', 'completed', 'failed'])->default('running');
            $table->timestamp('started_at');
            $table->timestamp('finished_at')->nullable();
            $table->integer('findings_count')->default(0);
            $table->text('error_message')->nullable();
        });

        // 4. file_integrity_findings
        Schema::create('file_integrity_findings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->constrained('sites')->cascadeOnDelete();
            $table->foreignId('scan_run_id')->constrained('security_scan_runs');
            $table->string('file_path', 1000);
            $table->enum('change_type', ['added', 'modified', 'deleted']);
            $table->enum('severity', ['critical', 'high', 'medium', 'low', 'info']);
            $table->string('file_hash_current', 64)->nullable();
            $table->string('file_hash_baseline', 64)->nullable();
            $table->enum('status', ['open', 'resolved', 'acknowledged'])->default('open');
            $table->timestamp('resolved_at')->nullable();
            $table->foreignId('acknowledged_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('detected_at');

            $table->index(['site_id', 'status']);
        });

        // 5. login_events
        Schema::create('login_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->constrained('sites')->cascadeOnDelete();
            $table->enum('event_type', ['failed', 'success']);
            $table->string('username', 255)->nullable();
            $table->bigInteger('wp_user_id')->nullable();
            $table->string('ip_address', 45);
            $table->text('user_agent')->nullable();
            $table->timestamp('occurred_at');
            $table->timestamp('created_at');

            $table->index(['site_id', 'event_type', 'occurred_at']);
            $table->index(['site_id', 'ip_address', 'occurred_at']);
        });

        // 6. known_login_ips
        Schema::create('known_login_ips', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->constrained('sites')->cascadeOnDelete();
            $table->string('ip_address', 45);
            $table->timestamp('first_seen_at');
            $table->timestamp('last_seen_at');

            $table->unique(['site_id', 'ip_address']);
        });

        // 7. security_alerts
        Schema::create('security_alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->constrained('sites')->cascadeOnDelete();
            $table->string('alert_type', 100);
            $table->enum('severity', ['critical', 'high', 'medium', 'low']);
            $table->string('title', 500);
            $table->text('detail')->nullable(); // JSON context
            $table->enum('status', ['open', 'acknowledged', 'resolved'])->default('open');
            $table->boolean('telegram_sent')->default(false);
            $table->timestamp('telegram_sent_at')->nullable();
            $table->foreignId('acknowledged_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('acknowledged_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamp('created_at');

            $table->index(['site_id', 'status', 'severity']);
            $table->index(['created_at']);
        });

        // 8. site_admin_users
        Schema::create('site_admin_users', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->constrained('sites')->cascadeOnDelete();
            $table->bigInteger('wp_user_id');
            $table->string('username', 255);
            $table->string('email', 255)->nullable();
            $table->timestamp('registered_at')->nullable();
            $table->timestamp('last_login_at')->nullable();
            $table->boolean('two_fa_enabled')->default(false);
            $table->enum('two_fa_method', ['totp', 'email'])->nullable();
            $table->boolean('reviewed')->default(false);
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->enum('status', ['active', 'deleted'])->default('active');
            $table->timestamp('first_detected_at');
            $table->timestamp('last_synced_at');

            $table->unique(['site_id', 'wp_user_id']);
        });

        // 9. site_2fa_settings
        Schema::create('site_2fa_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->unique()->constrained('sites')->cascadeOnDelete();
            $table->boolean('enabled')->default(false);
            $table->enum('method', ['totp', 'email'])->nullable();
            $table->string('wp_plugin_used', 100)->nullable();
            $table->boolean('enforce_for_admins')->default(true);
            $table->foreignId('enabled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('enabled_at')->nullable();
            $table->timestamp('updated_at')->nullable();
        });

        // 10. site_security_scores
        Schema::create('site_security_scores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('site_id')->constrained('sites')->cascadeOnDelete();
            $table->unsignedTinyInteger('score'); // 0-100
            $table->date('score_date');
            $table->json('breakdown');
            $table->timestamp('calculated_at');

            $table->unique(['site_id', 'score_date']);
            $table->index(['site_id', 'score_date']);
        });

        // 12. vulnerability_sync_logs
        Schema::create('vulnerability_sync_logs', function (Blueprint $table) {
            $table->id();
            $table->enum('status', ['success', 'failed']);
            $table->integer('total_fetched')->default(0);
            $table->integer('total_new')->default(0);
            $table->integer('total_updated')->default(0);
            $table->text('error_message')->nullable();
            $table->timestamp('synced_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vulnerability_sync_logs');
        Schema::dropIfExists('site_security_scores');
        Schema::dropIfExists('site_2fa_settings');
        Schema::dropIfExists('site_admin_users');
        Schema::dropIfExists('security_alerts');
        Schema::dropIfExists('known_login_ips');
        Schema::dropIfExists('login_events');
        Schema::dropIfExists('file_integrity_findings');
        Schema::dropIfExists('security_scan_runs');
        Schema::dropIfExists('file_integrity_baselines');
        Schema::dropIfExists('site_vulnerabilities');
        Schema::dropIfExists('vulnerability_definitions');
    }
};
