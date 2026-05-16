<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Plugin extends Model
{
    protected $fillable = ['name', 'slug', 'description', 'author', 'is_active', 'created_by'];

    protected $casts = ['is_active' => 'boolean'];

    public function versions(): HasMany
    {
        return $this->hasMany(PluginVersion::class);
    }

    public function latestVersion()
    {
        return $this->hasOne(PluginVersion::class)->where('is_stable', true)->latest('released_at');
    }

    public function sitePlugins(): HasMany
    {
        return $this->hasMany(SitePlugin::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
