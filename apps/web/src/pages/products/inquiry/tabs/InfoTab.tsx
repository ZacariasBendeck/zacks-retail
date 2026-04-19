import React from 'react';
import { Descriptions } from 'antd';
import type { InquiryInfo } from '../../../../types/inventoryInquiry';

export type { InquiryInfo };

export const InfoTab: React.FC<{ info: InquiryInfo }> = ({ info }) => (
  <Descriptions size="small" column={2} bordered>
    <Descriptions.Item label="Season">{info.seasonCode ?? '—'}</Descriptions.Item>
    <Descriptions.Item label="Label Code">{info.labelCode ?? '—'}</Descriptions.Item>
    <Descriptions.Item label="Group Code">{info.groupCode ?? '—'}</Descriptions.Item>
    <Descriptions.Item label="Date 1st Received">{info.firstReceivedAt ?? '—'}</Descriptions.Item>
    <Descriptions.Item label="Date Last Markdown">{info.lastMarkdownAt ?? '—'}</Descriptions.Item>
    <Descriptions.Item label="Perks">{info.perks ?? '—'}</Descriptions.Item>
    <Descriptions.Item label="Comments" span={2}>{info.comment ?? '—'}</Descriptions.Item>
  </Descriptions>
);
