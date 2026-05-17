<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SiteSecurityScore extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'site_id',
        'score',
        'score_date',
        'breakdown',
        'calculated_at',
    ];

    protected $casts = [
        'breakdown' => 'array',
        'score_date' => 'date',
        'calculated_at' => 'datetime',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }
}
