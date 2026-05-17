<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SitePlugin extends Model
{
    public $timestamps = false;

    protected $fillable = ['site_id', 'plugin_id', 'plugin_slug', 'plugin_name', 'plugin_file', 'plugin_type', 'installed_version', 'latest_version', 'is_active', 'update_available', 'last_synced_at'];

    protected $casts = [
        'is_active' => 'boolean',
        'update_available' => 'boolean',
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

    public function externalPlugin(): BelongsTo
    {
        return $this->belongsTo(ExternalPluginCache::class, 'plugin_slug', 'slug');
    }

    public function isOutdated(): bool
    {
        if (!$this->installed_version || !$this->latest_version) {
            return false;
        }
        return version_compare($this->installed_version, $this->latest_version, '<');
    }

    public function scopeWporg($query)
    {
        return $query->where('plugin_type', 'wporg');
    }

    public function scopeInternal($query)
    {
        return $query->where('plugin_type', 'internal');
    }

    public function scopePremium($query)
    {
        return $query->where('plugin_type', 'premium');
    }

    public function scopeWithUpdates($query)
    {
        return $query->where('update_available', true);
    }
}
