import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";
import { menuProductInfo } from "../lib/menuProductInfo";

export type AppVersionState = { version: string | null; loading: boolean; error: boolean };
type NativeVersionReader = () => Promise<{ version: unknown }>;

const readNativeVersion: NativeVersionReader = async () => {
  const { App } = await import("@capacitor/app");
  return App.getInfo();
};

/** Native bundles can have a different version from the web package. */
export const readAppVersion = async (nativePlatform: boolean, nativeReader = readNativeVersion): Promise<string | null> => {
  if (!nativePlatform) return menuProductInfo.version;
  const info = await nativeReader();
  return typeof info.version === "string" && info.version.trim() ? info.version.trim() : null;
};

export const useAppVersion = (): AppVersionState => {
  const nativePlatform = Capacitor.isNativePlatform();
  const [state, setState] = useState<AppVersionState>(() => nativePlatform
    ? { version: null, loading: true, error: false }
    : { version: menuProductInfo.version, loading: false, error: false });

  useEffect(() => {
    if (!nativePlatform) {
      setState({ version: menuProductInfo.version, loading: false, error: false });
      return;
    }
    let active = true;
    setState({ version: null, loading: true, error: false });
    void readAppVersion(true).then((version) => {
      if (active) setState({ version, loading: false, error: version === null });
    }).catch(() => {
      if (active) setState({ version: null, loading: false, error: true });
    });
    return () => { active = false; };
  }, [nativePlatform]);

  return state;
};
