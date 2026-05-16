<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add 'scheduled' to deployment_jobs status enum (PostgreSQL CHECK constraint)
        DB::statement("ALTER TABLE deployment_jobs DROP CONSTRAINT IF EXISTS deployment_jobs_status_check");
        DB::statement("ALTER TABLE deployment_jobs ADD CONSTRAINT deployment_jobs_status_check CHECK (status::text = ANY (ARRAY['queued','running','completed','failed','cancelled','scheduled']::text[]))");

        Schema::table('deployment_jobs', function (Blueprint $table) {
            $table->string('job_type', 20)->default('deploy')->after('status');
            $table->timestamp('scheduled_at')->nullable()->after('note');
        });

        // Add 'healthy' and 'rolled_back' to deployment_job_sites status enum
        DB::statement("ALTER TABLE deployment_job_sites DROP CONSTRAINT IF EXISTS deployment_job_sites_status_check");
        DB::statement("ALTER TABLE deployment_job_sites ADD CONSTRAINT deployment_job_sites_status_check CHECK (status::text = ANY (ARRAY['pending','running','success','failed','skipped','healthy','rolled_back']::text[]))");

        Schema::table('deployment_job_sites', function (Blueprint $table) {
            $table->string('rollback_version', 50)->nullable();
            $table->text('rollback_reason')->nullable();
            $table->json('health_check_results')->nullable();
            $table->timestamp('rolled_back_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('deployment_job_sites', function (Blueprint $table) {
            $table->dropColumn(['rollback_version', 'rollback_reason', 'health_check_results', 'rolled_back_at']);
        });

        DB::statement("ALTER TABLE deployment_job_sites DROP CONSTRAINT IF EXISTS deployment_job_sites_status_check");
        DB::statement("ALTER TABLE deployment_job_sites ADD CONSTRAINT deployment_job_sites_status_check CHECK (status::text = ANY (ARRAY['pending','running','success','failed','skipped']::text[]))");

        Schema::table('deployment_jobs', function (Blueprint $table) {
            $table->dropColumn(['job_type', 'scheduled_at']);
        });

        DB::statement("ALTER TABLE deployment_jobs DROP CONSTRAINT IF EXISTS deployment_jobs_status_check");
        DB::statement("ALTER TABLE deployment_jobs ADD CONSTRAINT deployment_jobs_status_check CHECK (status::text = ANY (ARRAY['queued','running','completed','failed','cancelled']::text[]))");
    }
};
