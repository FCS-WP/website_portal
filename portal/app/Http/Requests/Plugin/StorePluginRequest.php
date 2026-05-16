<?php

namespace App\Http\Requests\Plugin;

use Illuminate\Foundation\Http\FormRequest;

class StorePluginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:255',
            'slug' => ['nullable', 'string', 'max:255', 'unique:plugins,slug', 'regex:/^[a-z0-9]+(-[a-z0-9]+)*$/'],
            'description' => 'nullable|string',
            'author' => 'nullable|string|max:255',
        ];
    }

    public function messages(): array
    {
        return [
            'slug.regex' => 'The slug must be lowercase letters, numbers, and hyphens only.',
        ];
    }
}
