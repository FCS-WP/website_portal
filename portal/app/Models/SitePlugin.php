<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SitePlugin extends Model
{
    public $timestamps = false;

    protected $fillable = ['site_id', 'plugin_id', 'installed_version', 'latest_version', 'is_active', 'last_synced_at'];

    protected $casts = [
        'is_active' => 'boolean',
        'last_synced_at' => 'datetime',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function plugin(): BelongsTo
    {
        return $this->belongsTo(Plugin::class);
    }

    public function isOutdated(): bool
    {
        if (!$this->installed_version || !$this->latest_version) {
            return false;
        }
        return version_compare($this->installed_version, $this->latest_version, '<');
    }
}
