<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('deployment_job_sites', function (Blueprint $table) {
            $table->id();
            $table->foreignId('deployment_job_id')->constrained('deployment_jobs')->cascadeOnDelete();
            $table->foreignId('site_id')->constrained('sites');
            $table->enum('status', ['pending', 'running', 'success', 'failed', 'skipped'])->default('pending');
            $table->text('error_message')->nullable();
            $table->integer('attempt_count')->default(0);
            $table->timestamp('deployed_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('deployment_job_sites');
    }
};
