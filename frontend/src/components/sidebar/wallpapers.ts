export interface Wallpaper {
  id: string;
  label: string;
  url: string;
}

/**
 * Built-in wallpapers, discovered at build time.
 *
 * The glob is deliberately broad: dropping `wallpaper2.png` into the folder
 * makes it appear with no code change, which is the whole point of the naming
 * convention. Extensions are matched too, so a jpg and a png work alike.
 */
const MODULES = import.meta.glob<string>('../../assets/wallpapers/wallpaper*.{png,jpg,jpeg,webp,avif}', {
  eager: true,
  import: 'default',
});

const NUMBER = /wallpaper(\d+)\.[a-z]+$/i;

export const BUILT_IN: Wallpaper[] = Object.entries(MODULES)
  .map(([path, url]) => {
    const index = Number(NUMBER.exec(path)?.[1] ?? 0);
    return { id: `builtin-${index}`, label: `Wallpaper ${index}`, url, index };
  })
  // Sorted numerically so `wallpaper10` never lands between 1 and 2.
  .sort((left, right) => left.index - right.index)
  .map(({ id, label, url }) => ({ id, label, url }));

export const CUSTOM_PREFIX = 'custom-';

export const isCustom = (id: string): boolean => id.startsWith(CUSTOM_PREFIX);
