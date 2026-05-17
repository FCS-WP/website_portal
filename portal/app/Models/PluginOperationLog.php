<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PluginOperationLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'site_id', 'plugin_slug', 'plugin_name', 'operation',
        'status', 'error_message', 'performed_by', 'performed_at',
    ];

    protected $casts = [
        'performed_at' => 'datetime',
    ];

    public function site()
    {
        return $this->belongsTo(Site::class);
    }

    public function performer()
    {
        return $this->belongsTo(User::class, 'performed_by');
    }
}
