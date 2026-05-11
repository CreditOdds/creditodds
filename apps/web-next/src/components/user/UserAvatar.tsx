'use client';

import Avatar from 'boring-avatars';

const BRAND_PALETTE = ['#6d3fe8', '#1a1330', '#a78bfa', '#fde68a', '#fef3c7'];

export type UserAvatarVariant =
  | 'marble'
  | 'beam'
  | 'pixel'
  | 'sunset'
  | 'ring'
  | 'bauhaus'
  | 'geometric'
  | 'abstract';

type UserAvatarProps = {
  seed?: string | null;
  size?: number;
  variant?: UserAvatarVariant;
  square?: boolean;
  className?: string;
  title?: string;
};

export default function UserAvatar({
  seed,
  size = 32,
  variant = 'beam',
  square = true,
  className,
  title,
}: UserAvatarProps) {
  const name = seed && seed.length > 0 ? seed : 'guest';
  return (
    <Avatar
      name={name}
      variant={variant}
      colors={BRAND_PALETTE}
      size={size}
      square={square}
      title={title}
      className={className}
    />
  );
}
