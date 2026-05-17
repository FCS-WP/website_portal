<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Builder;

class Site extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'hosting_id',
        'name',
        'url',
        'description',
        'api_secret_key',
        'api_key_encrypted',
        'status',
        'wp_version',
        'php_version',
        'woo_active',
        'last_ping_at',
        'tags',
        'created_by',
        'is_beta_tester',
    ];

    protected $casts = [
        'woo_active' => 'boolean',
        'last_ping_at' => 'datetime',
        'tags' => 'array',
        'is_beta_tester' => 'boolean',
    ];

    protected $hidden = [
        'api_secret_key',
        'api_key_encrypted',
    ];

    public function hosting(): BelongsTo
    {
        return $this->belongsTo(Hosting::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'site_users')->withTimestamps();
    }

    public function activityLogs(): HasMany
    {
        return $this->hasMany(ActivityLog::class, 'subject_id')
            ->where('subject_type', self::class);
    }

    public function sitePlugins(): HasMany
    {
        return $this->hasMany(SitePlugin::class);
    }

    public function deploymentJobSites(): HasMany
    {
        return $this->hasMany(DeploymentJobSite::class);
    }

    public function securityAlerts(): HasMany
    {
        return $this->hasMany(SecurityAlert::class);
    }

    public function fileIntegrityBaseline(): HasOne
    {
        return $this->hasOne(FileIntegrityBaseline::class);
    }

    public function fileIntegrityFindings(): HasMany
    {
        return $this->hasMany(FileIntegrityFinding::class);
    }

    public function siteVulnerabilities(): HasMany
    {
        return $this->hasMany(SiteVulnerability::class);
    }

    public function loginEvents(): HasMany
    {
        return $this->hasMany(LoginEvent::class);
    }

    public function siteAdminUsers(): HasMany
    {
        return $this->hasMany(SiteAdminUser::class);
    }

    public function site2faSetting(): HasOne
    {
        return $this->hasOne(Site2faSetting::class);
    }

    public function securityScores(): HasMany
    {
        return $this->hasMany(SiteSecurityScore::class);
    }

    public function securityScanRuns(): HasMany
    {
        return $this->hasMany(SecurityScanRun::class);
    }

    /**
     * Scope to filter sites by user assignment (for dev/mkt users)
     */
    public function scopeAccessibleBy(Builder $query, User $user): Builder
    {
        if ($user->role === 'admin') {
            return $query;
        }

        return $query->whereHas('users', function ($q) use ($user) {
            $q->where('users.id', $user->id);
        });
    }
}
