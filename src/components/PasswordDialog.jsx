import { useState } from "react";

import { inputClass, primaryButton, secondaryButton } from "./ui";

export default function PasswordDialog({ fileName, error, busy, onSubmit, onCancel }) {
  const [password, setPassword] = useState("");

  function submit(event) {
    event.preventDefault();
    if (password) onSubmit(password);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-xl"
      >
        <div>
          <h2 className="text-lg font-semibold">Password required</h2>
          <p className="mt-1 break-all text-sm text-slate-400">
            {fileName} is protected. Enter its password to open it.
          </p>
        </div>
        <input
          type="password"
          autoFocus
          autoComplete="off"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="PDF password"
          className={`${inputClass} w-full`}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={!password || busy} className={primaryButton}>
            {busy ? "Unlocking..." : "Unlock"}
          </button>
        </div>
      </form>
    </div>
  );
}
