<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class ActivityLogService
{
    /**
     * Log an activity.
     */
    public static function log(string $action, ?Model $subject = null, ?User $user = null, ?string $ipAddress = null, ?array $metadata = null): void
    {
        try {
            $data = [
                'action' => $action,
                'user_id' => $user?->id,
                'ip_address' => $ipAddress,
            ];

            if ($subject) {
                $data['subject_type'] = get_class($subject);
                $data['subject_id'] = $subject->getKey();
            }

            if ($metadata) {
                $data['metadata'] = $metadata;
            }

            // Try to insert into activity_logs table if it exists
            if (Schema::hasTable('activity_logs')) {
                DB::table('activity_logs')->insert(array_merge($data, [
                    'metadata' => isset($data['metadata']) ? json_encode($data['metadata']) : null,
                    'created_at' => now(),
                ]));
            } else {
                Log::info('Activity Log', $data);
            }
        } catch (\Throwable $e) {
            Log::warning('Failed to write activity log: ' . $e->getMessage(), [
                'action' => $action,
            ]);
        }
    }
}
