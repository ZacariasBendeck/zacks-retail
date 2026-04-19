import React, { useState } from 'react';
import { Empty } from 'antd';

export const PicturePanel: React.FC<{ pictureUrl: string | null; alt: string }> = ({ pictureUrl, alt }) => {
  const [failed, setFailed] = useState(false);
  if (!pictureUrl || failed) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No picture" />;
  }
  return (
    <img
      src={pictureUrl}
      alt={alt}
      onError={() => setFailed(true)}
      style={{ maxWidth: 220, maxHeight: 220, objectFit: 'contain' }}
    />
  );
};
