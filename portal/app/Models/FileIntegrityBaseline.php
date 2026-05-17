<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FileIntegrityBaseline extends Model
{
    protected $fillable = [
        'site_id',
        'file_hashes',
        'file_count',
        'created_by',
    ];

    protected $casts = [
        'file_hashes' => 'array',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
