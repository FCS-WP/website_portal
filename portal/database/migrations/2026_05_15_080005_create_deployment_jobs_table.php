<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('deployment_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('plugin_version_id')->constrained('plugin_versions');
            $table->foreignId('initiated_by')->constrained('users');
            $table->enum('status', ['queued', 'running', 'completed', 'failed', 'cancelled'])->default('queued');
            $table->integer('total_sites')->default(0);
            $table->integer('success_count')->default(0);
            $table->integer('failed_count')->default(0);
            $table->text('note')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('deployment_jobs');
    }
};
