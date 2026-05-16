<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PluginChangelog extends Model
{
    public $timestamps = false;

    protected $fillable = ['plugin_version_id', 'content', 'type'];

    protected $casts = ['created_at' => 'datetime'];

    public function version(): BelongsTo
    {
        return $this->belongsTo(PluginVersion::class, 'plugin_version_id');
    }
}
