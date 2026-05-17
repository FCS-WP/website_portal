<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ExternalPluginCache extends Model
{
    protected $table = 'external_plugins_cache';

    protected $fillable = [
        'slug', 'name', 'author', 'latest_version', 'download_url',
        'latest_file_hash', 'requires_wp', 'tested_up_to', 'rating',
        'active_installs', 'last_updated_wporg', 'is_on_wporg',
        'is_abandoned', 'last_synced_at',
    ];

    protected $casts = [
        'rating' => 'decimal:2',
        'is_on_wporg' => 'boolean',
        'is_abandoned' => 'boolean',
        'last_updated_wporg' => 'datetime',
        'last_synced_at' => 'datetime',
    ];

    // Relationship: sites that have this plugin installed
    public function sitePlugins()
    {
        return $this->hasMany(SitePlugin::class, 'plugin_slug', 'slug');
    }

    // Scope: only plugins actually on WP.org
    public function scopeOnWporg($query)
    {
        return $query->where('is_on_wporg', true);
    }

    // Scope: abandoned plugins
    public function scopeAbandoned($query)
    {
        return $query->where('is_abandoned', true);
    }

    // Check if plugin is abandoned (>730 days since last update)
    public function getIsAbandonedAttribute($value)
    {
        return (bool) $value;
    }
}
