/**
 * A touch-first device: a phone or tablet whose only pointer is a finger. These start
 * with the touch layout and load lighter art (see assets.ts), since mobile browsers close
 * a tab that uses much more than a gigabyte, iOS's sooner.
 */
export function touchFirst() {
  try {
    return (
      matchMedia("(pointer: coarse)").matches &&
      !matchMedia("(any-pointer: fine)").matches
    );
  } catch {
    return false;
  }
}
