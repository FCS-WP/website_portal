<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sites', function (Blueprint $table) {
            $table->boolean('is_beta_tester')->default(false);
        });

        Schema::table('plugin_versions', function (Blueprint $table) {
            $table->string('track', 20)->default('stable'); // 'beta' or 'stable'
        });
    }

    public function down(): void
    {
        Schema::table('sites', function (Blueprint $table) {
            $table->dropColumn('is_beta_tester');
        });

        Schema::table('plugin_versions', function (Blueprint $table) {
            $table->dropColumn('track');
        });
    }
};
