'use client';

import Image, { ImageProps } from 'next/image';
import { useState } from 'react';

const CARD_IMAGE_CDN = 'https://d3ay3etzd1512y.cloudfront.net/card_images';
const FALLBACK_IMAGE = '/assets/generic-card.svg';

type CardImageProps = Omit<ImageProps, 'src' | 'onError'> & {
  cardImageLink?: string | null;
};

export default function CardImage({ cardImageLink, alt, ...props }: CardImageProps) {
  const [errored, setErrored] = useState(false);

  const src = !errored && cardImageLink
    ? `${CARD_IMAGE_CDN}/${cardImageLink}`
    : FALLBACK_IMAGE;

  return (
    <Image
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      {...props}
    />
  );
}
