<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('credential_share_links', function (Blueprint $table) {
            $table->jsonb('credential_ids')->nullable()->after('credential_type_ids');
        });
    }

    public function down(): void
    {
        Schema::table('credential_share_links', function (Blueprint $table) {
            $table->dropColumn('credential_ids');
        });
    }
};
