import { useRef, useState } from 'react';
import { Camera, Loader2, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { uploadAvatar, validateAvatar } from '@/lib/storage';
import { errorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/authStore';

/**
 * Self-service profile-picture uploader. Used on the employee, employer and
 * admin profile pages - each person uploads their own photo, which is stored
 * publicly (see avatars-storage-patch.sql) and written to profiles.avatar_url.
 */
export default function AvatarUpload({ name }: { name: string }) {
  const user = useAuthStore((state) => state.user);
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null) {
    if (!file || !user?.id) return;
    setError('');

    const validationError = validateAvatar(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    try {
      const { url, error: uploadError } = await uploadAvatar(user.id, file);
      if (uploadError || !url) throw uploadError ?? new Error('Upload failed.');

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: url, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (updateError) throw updateError;

      setAvatarUrl(url);
      await useAuthStore.getState().initializeAuth();
    } catch (err) {
      setError(errorMessage(err, 'Unable to upload your photo.'));
    } finally {
      setBusy(false);
    }
  }

  const initial = name.trim().charAt(0).toUpperCase() || 'E';

  return (
    <div className="avatar-upload">
      <div className="avatar-upload-preview">
        {avatarUrl ? (
          <img src={avatarUrl} alt={`${name}'s profile photo`} />
        ) : (
          <span aria-hidden="true">{initial}</span>
        )}
      </div>
      <div>
        <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 size={15} className="spin" /> : <Camera size={15} />}
          {avatarUrl ? 'Change photo' : 'Upload photo'}
        </button>
        <p className="hint">JPG, PNG or WEBP, up to 3 MB.</p>
        {error ? <p className="error">{error}</p> : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(event) => {
          void handleFile(event.target.files?.[0] ?? null);
          event.target.value = '';
        }}
      />
    </div>
  );
}

export { User as AvatarFallbackIcon };
