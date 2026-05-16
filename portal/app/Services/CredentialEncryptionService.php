<?php

namespace App\Services;

use RuntimeException;

class CredentialEncryptionService
{
    private string $key;

    public function __construct()
    {
        $hexKey = config('app.vault_master_key');
        if (!$hexKey || strlen($hexKey) !== 64) {
            throw new RuntimeException('VAULT_MASTER_KEY must be a 64-character hex string.');
        }
        $this->key = hex2bin($hexKey); // 32 bytes = 256 bits
    }

    /**
     * Encrypt a plaintext value using AES-256-GCM.
     * Returns: base64(iv):base64(tag):base64(ciphertext)
     */
    public function encrypt(string $plaintext): string
    {
        $iv = random_bytes(16); // 16-byte IV
        $tag = '';
        
        $ciphertext = openssl_encrypt(
            $plaintext,
            'aes-256-gcm',
            $this->key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            '', // no AAD
            16  // tag length
        );

        if ($ciphertext === false) {
            throw new RuntimeException('Encryption failed.');
        }

        return base64_encode($iv) . ':' . base64_encode($tag) . ':' . base64_encode($ciphertext);
    }

    /**
     * Decrypt an encrypted value.
     * Input format: base64(iv):base64(tag):base64(ciphertext)
     */
    public function decrypt(string $stored): string
    {
        if ($stored === '') {
            return '';
        }

        $parts = explode(':', $stored, 3);
        if (count($parts) !== 3) {
            throw new RuntimeException('Invalid encrypted format.');
        }

        [$ivB64, $tagB64, $ciphertextB64] = $parts;

        $iv = base64_decode($ivB64, true);
        $tag = base64_decode($tagB64, true);
        $ciphertext = base64_decode($ciphertextB64, true);

        if ($iv === false || $tag === false || $ciphertext === false) {
            throw new RuntimeException('Invalid base64 encoding in encrypted value.');
        }

        $plaintext = openssl_decrypt(
            $ciphertext,
            'aes-256-gcm',
            $this->key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );

        if ($plaintext === false) {
            throw new RuntimeException('Decryption failed: authentication tag verification failed.');
        }

        return $plaintext;
    }

    /**
     * Re-encrypt a value with a new key.
     */
    public function reEncrypt(string $stored, string $newHexKey): string
    {
        // Decrypt with current key
        $plaintext = $this->decrypt($stored);

        // Encrypt with new key
        $newKey = hex2bin($newHexKey);
        $iv = random_bytes(16);
        $tag = '';

        $ciphertext = openssl_encrypt(
            $plaintext,
            'aes-256-gcm',
            $newKey,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            '',
            16
        );

        if ($ciphertext === false) {
            throw new RuntimeException('Re-encryption failed.');
        }

        return base64_encode($iv) . ':' . base64_encode($tag) . ':' . base64_encode($ciphertext);
    }
}
