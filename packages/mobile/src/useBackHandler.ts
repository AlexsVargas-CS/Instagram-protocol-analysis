import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

// Android hardware/gesture back. The handler returns true when it consumed the press;
// returning false lets it fall through to the next subscriber and, if nobody claims it,
// to Android's default — which backgrounds the app. Only the root screen should return
// false, so "back" walks the app's state stack down and exits from the thread list.
//
// The callback is held in a ref so the subscription is created once per mount:
// BackHandler dispatches in reverse registration order, and re-subscribing on every
// render would quietly reshuffle that priority between screens. On iOS BackHandler is a
// no-op stub, so this costs nothing there.
export function useBackHandler(handler: () => boolean): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => handlerRef.current());
    return () => sub.remove();
  }, []);
}
