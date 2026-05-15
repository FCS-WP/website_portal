<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\Hosting;
use App\Traits\ApiResponse;
use App\Http\Requests\Hosting\StoreHostingRequest;
use App\Http\Requests\Hosting\UpdateHostingRequest;
use App\Services\ActivityLogService;
use Illuminate\Http\Request;

class HostingController extends Controller
{
    use ApiResponse;

    public function index(Request $request)
    {
        $hostings = Hosting::withCount('sites')
            ->orderBy('created_at', 'desc')
            ->get();

        return $this->successResponse($hostings);
    }

    public function store(StoreHostingRequest $request)
    {
        $hosting = Hosting::create([
            ...$request->validated(),
            'created_by' => $request->user()->id,
        ]);

        ActivityLogService::log(
            'hosting.created',
            $hosting,
            $request->user(),
            $request->ip()
        );

        return $this->successResponse($hosting, 'Hosting created successfully.', 201);
    }

    public function show(Hosting $hosting)
    {
        $hosting->loadCount('sites');
        return $this->successResponse($hosting);
    }

    public function update(UpdateHostingRequest $request, Hosting $hosting)
    {
        $hosting->update($request->validated());

        ActivityLogService::log(
            'hosting.updated',
            $hosting,
            $request->user(),
            $request->ip()
        );

        return $this->successResponse($hosting, 'Hosting updated successfully.');
    }

    public function destroy(Request $request, Hosting $hosting)
    {
        $sitesCount = $hosting->sites()->count();

        // Unlink sites from this hosting (set hosting_id to null)
        $hosting->sites()->update(['hosting_id' => null]);

        $hosting->delete();

        ActivityLogService::log(
            'hosting.deleted',
            $hosting,
            $request->user(),
            $request->ip(),
            ['had_sites' => $sitesCount]
        );

        return $this->successResponse(null, 'Hosting deleted successfully.', 200);
    }
}
