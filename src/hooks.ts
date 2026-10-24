import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import {
  onAuthStateChanged,
  signInAnonymously,
  type User,
} from "firebase/auth";
import { createFirebaseClient } from "./firebase";
import { db, path } from "./api";
export function useValue<T>(location: string | null) {
  const [state, setState] = useState<{
    value: T | null;
    error: string;
    loading: boolean;
  }>({ value: null, error: "", loading: !!location });
  useEffect(() => {
    setState({ value: null, error: "", loading: !!location });
    if (!location) return;
    return onValue(
      path(location),
      (snap) => setState({ value: snap.val(), error: "", loading: false }),
      (error) =>
        setState({ value: null, error: error.message, loading: false }),
    );
  }, [location]);
  return state;
}
export function useUser(anonymous: boolean) {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const auth = createFirebaseClient().auth;
      return onAuthStateChanged(auth, (u) => {
        setUser(u);
        setReady(true);
        if (!u && anonymous)
          void signInAnonymously(auth).catch((e) => setError(e.message));
      });
    } catch (e) {
      setError((e as Error).message);
      setReady(true);
    }
  }, [anonymous]);
  return { user, error, ready };
}
export function useClock() {
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const connected = useValue<boolean>(".info/connected");
  useEffect(() => {
    const stop = onValue(ref(db(), ".info/serverTimeOffset"), (snap) =>
      setOffset(snap.val() ?? 0),
    );
    return stop;
  }, []);
  useEffect(() => {
    setNow(Date.now() + offset);
    const timer = setInterval(() => setNow(Date.now() + offset), 500);
    return () => clearInterval(timer);
  }, [offset]);
  return { now, connected: connected.value === true };
}
