import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Divider,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PermissionDefinition, Role, RoleSafetyWarning, userApi } from '../../services/userApi';

function permissionOption(permission: PermissionDefinition) {
  return {
    label: (
      <Space direction="vertical" size={0}>
        <Typography.Text>{permission.label}</Typography.Text>
        <Typography.Text type="secondary">{permission.key}</Typography.Text>
        <Typography.Text type="secondary">{permission.description}</Typography.Text>
      </Space>
    ),
    value: permission.key,
  };
}

function roleWarnings(permissions: string[]): RoleSafetyWarning[] {
  const granted = new Set(permissions);
  const warnings: RoleSafetyWarning[] = [];
  const has = (permission: string) => granted.has(permission);
  const push = (warning: RoleSafetyWarning) => warnings.push(warning);

  if (permissions.length === 0) {
    push({ code: 'NO_PERMISSIONS', severity: 'info', message: 'This role does not grant any application access.', permissions: [] });
  }
  if (has('identity_access.manage')) {
    push({
      code: 'IDENTITY_ADMIN',
      severity: 'critical',
      message: 'Can manage users, roles, passwords, sessions, and access scopes.',
      permissions: ['identity_access.manage'],
    });
  }
  if (has('inventory.adjust')) {
    push({
      code: 'INVENTORY_ADJUST',
      severity: 'warning',
      message: 'Can change stock quantities through adjustments, receipts, transfers, or returns.',
      permissions: ['inventory.adjust'],
    });
  }
  if (has('purchasing.edit') && has('purchasing.approve')) {
    push({
      code: 'PURCHASING_EDIT_APPROVE',
      severity: 'warning',
      message: 'Can both edit and approve purchasing work, reducing separation of duties.',
      permissions: ['purchasing.edit', 'purchasing.approve'],
    });
  }
  if (has('purchasing.edit') && has('inventory.adjust')) {
    push({
      code: 'PURCHASING_INVENTORY_COMBO',
      severity: 'warning',
      message: 'Can edit purchasing documents and adjust inventory, which should be limited to trusted roles.',
      permissions: ['purchasing.edit', 'inventory.adjust'],
    });
  }
  if (has('sales_pos.refund')) {
    push({
      code: 'POS_REFUND',
      severity: 'warning',
      message: 'Can perform or approve POS refund workflows.',
      permissions: ['sales_pos.refund'],
    });
  }
  if (has('reports.admin')) {
    push({
      code: 'REPORTS_ADMIN',
      severity: 'warning',
      message: 'Can administer report templates, shared snapshots, and report visibility.',
      permissions: ['reports.admin'],
    });
  }
  if (has('segmentation.admin') || (has('segmentation.write') && has('segmentation.activate'))) {
    push({
      code: 'SEGMENTATION_ACTIVATION',
      severity: 'warning',
      message: 'Can change and activate customer segmentation outputs used by retail operations.',
      permissions: ['segmentation.admin', 'segmentation.write', 'segmentation.activate'].filter((permission) => has(permission)),
    });
  }

  return warnings;
}

function warningAlertType(severity: RoleSafetyWarning['severity']): 'info' | 'warning' | 'error' {
  if (severity === 'critical') return 'error';
  if (severity === 'warning') return 'warning';
  return 'info';
}

export default function RolePermissionsPage() {
  const queryClient = useQueryClient();
  const [includeArchived, setIncludeArchived] = useState(false);
  const rolesQuery = useQuery({
    queryKey: ['roles', { includeArchived }],
    queryFn: () => userApi.listRoles({ includeArchived }),
  });
  const permissionsQuery = useQuery({ queryKey: ['permissions'], queryFn: () => userApi.listPermissions() });
  const roles = rolesQuery.data?.roles ?? [];
  const activeRoles = roles.filter((role) => !role.archivedAt);
  const [selectedRoleId, setSelectedRoleId] = useState<string | undefined>();
  const [checkedPermissions, setCheckedPermissions] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const selectedRole = roles.find((role) => role.id === selectedRoleId);
  const roleLocked = Boolean(selectedRole?.locked || selectedRole?.archivedAt);
  const roleWarningsForSelection = roleWarnings(checkedPermissions);

  useEffect(() => {
    if (selectedRoleId && roles.some((role) => role.id === selectedRoleId)) return;
    const firstEditableRole = roles.find((role) => !role.locked && !role.archivedAt);
    setSelectedRoleId(firstEditableRole?.id ?? roles[0]?.id);
  }, [roles, selectedRoleId]);

  useEffect(() => {
    if (!selectedRole) return;
    setCheckedPermissions(selectedRole.permissions);
    setReason('');
  }, [selectedRole]);

  const groupedOptions = useMemo(() => (
    (permissionsQuery.data?.modules ?? []).map((module) => ({
      ...module,
      options: module.permissions.map(permissionOption),
    }))
  ), [permissionsQuery.data?.modules]);

  const refreshRoles = () => {
    queryClient.invalidateQueries({ queryKey: ['roles'] });
    queryClient.invalidateQueries({ queryKey: ['users'] });
    queryClient.invalidateQueries({ queryKey: ['effective-access'] });
  };

  const createMutation = useMutation({
    mutationFn: (values: { name: string; description?: string; cloneFromRoleId?: string; reason?: string }) =>
      userApi.createRole({
        name: values.name,
        description: values.description || null,
        cloneFromRoleId: values.cloneFromRoleId || null,
        permissions: values.cloneFromRoleId ? undefined : [],
        reason: values.reason || null,
      }),
    onSuccess: (res) => {
      message.success('Role created');
      setCreateOpen(false);
      createForm.resetFields();
      setSelectedRoleId(res.role.id);
      refreshRoles();
    },
    onError: (err: any) => message.error(err.message || 'Role create failed'),
  });

  const editMutation = useMutation({
    mutationFn: (values: { name: string; description?: string; reason?: string }) =>
      userApi.updateRole(selectedRoleId!, {
        name: values.name,
        description: values.description || null,
        reason: values.reason || null,
      }),
    onSuccess: () => {
      message.success('Role updated');
      setEditOpen(false);
      editForm.resetFields();
      refreshRoles();
    },
    onError: (err: any) => message.error(err.message || 'Role update failed'),
  });

  const archiveMutation = useMutation({
    mutationFn: () => userApi.archiveRole(selectedRoleId!, 'archived through role management'),
    onSuccess: () => {
      message.success('Role archived');
      setSelectedRoleId(undefined);
      refreshRoles();
    },
    onError: (err: any) => message.error(err.message || 'Role archive failed'),
  });

  const updateMutation = useMutation({
    mutationFn: () => userApi.updateRolePermissions(selectedRoleId!, {
      permissions: checkedPermissions,
      reason: reason || null,
    }),
    onSuccess: (res) => {
      message.success(`Role permissions updated; revoked ${res.revokedCount} session${res.revokedCount === 1 ? '' : 's'}`);
      refreshRoles();
      setReason('');
    },
    onError: (err: any) => message.error(err.message || 'Role update failed'),
  });

  const selectedCount = checkedPermissions.length;
  const totalCount = permissionsQuery.data?.permissions.length ?? 0;
  const canArchive = Boolean(selectedRole && !selectedRole.systemRole && !selectedRole.archivedAt && (selectedRole.assignedUserCount ?? 0) === 0);

  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Space style={{ display: 'flex', justifyContent: 'space-between' }} align="start">
          <Space direction="vertical" size={0}>
            <Typography.Title level={3} style={{ margin: 0 }}>Roles & Permissions</Typography.Title>
            <Typography.Text type="secondary">Roles group permissions for users. Sidebar access follows view permissions; buttons and sensitive tabs follow action permissions.</Typography.Text>
          </Space>
          <Space>
            <Tag color="blue">{selectedCount} selected</Tag>
            <Tag>{totalCount} total permissions</Tag>
          </Space>
        </Space>

        <Space wrap align="center">
          <Select
            style={{ minWidth: 280 }}
            placeholder="Select role"
            loading={rolesQuery.isLoading}
            value={selectedRoleId}
            onChange={setSelectedRoleId}
            options={roles.map((role: Role) => ({
              value: role.id,
              label: `${role.name}${role.locked ? ' (locked)' : ''}${role.archivedAt ? ' (archived)' : ''}`,
            }))}
          />
          <Switch checked={includeArchived} onChange={setIncludeArchived} />
          <Typography.Text type="secondary">Show archived</Typography.Text>
          <Button onClick={() => setCreateOpen(true)}>New role</Button>
          <Button
            disabled={!selectedRole}
            onClick={() => {
              createForm.setFieldsValue({ cloneFromRoleId: selectedRole?.id, name: `Copy of ${selectedRole?.name ?? ''}` });
              setCreateOpen(true);
            }}
          >
            Clone role
          </Button>
          <Button
            disabled={!selectedRole || selectedRole.systemRole || Boolean(selectedRole.archivedAt)}
            onClick={() => {
              editForm.setFieldsValue({
                name: selectedRole?.name,
                description: selectedRole?.description ?? '',
              });
              setEditOpen(true);
            }}
          >
            Rename / describe
          </Button>
          <Tooltip
            title={
              selectedRole?.systemRole
                ? 'System roles cannot be archived.'
                : (selectedRole?.assignedUserCount ?? 0) > 0
                  ? 'Unassign this role from users before archiving it.'
                  : undefined
            }
          >
            <Popconfirm
              title="Archive this role?"
              description="Archived roles cannot be assigned or edited. Existing history is preserved."
              disabled={!canArchive}
              onConfirm={() => archiveMutation.mutate()}
            >
              <Button danger disabled={!canArchive} loading={archiveMutation.isPending}>
                Archive
              </Button>
            </Popconfirm>
          </Tooltip>
        </Space>

        {selectedRole && (
          <Space wrap>
            <Tag color={selectedRole.archivedAt ? 'default' : 'green'}>{selectedRole.archivedAt ? 'Archived' : 'Active'}</Tag>
            {selectedRole.systemRole && <Tag color="purple">System role</Tag>}
            {selectedRole.locked && <Tag color="red">Locked</Tag>}
            <Tag>{selectedRole.assignedUserCount ?? 0} assigned users</Tag>
            {selectedRole.description && <Typography.Text type="secondary">{selectedRole.description}</Typography.Text>}
          </Space>
        )}

        {selectedRole?.locked && (
          <Alert
            type="info"
            showIcon
            message="OWNER is system-managed"
            description="The OWNER role always keeps every permission so the system cannot lock out all administrators."
          />
        )}

        {selectedRole?.archivedAt && (
          <Alert
            type="warning"
            showIcon
            message="This role is archived"
            description="Archived roles are kept for audit history but cannot be assigned or edited."
          />
        )}

        {roleWarningsForSelection.length > 0 && (
          <Space direction="vertical" style={{ width: '100%' }}>
            {roleWarningsForSelection.map((warning) => (
              <Alert
                key={warning.code}
                type={warningAlertType(warning.severity)}
                showIcon
                message={warning.message}
                description={warning.permissions.length > 0 ? warning.permissions.join(', ') : undefined}
              />
            ))}
          </Space>
        )}

        <Space wrap>
          <Input
            style={{ minWidth: 340 }}
            placeholder="Reason for permission change"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={roleLocked}
          />
          <Button
            type="primary"
            disabled={!selectedRole || roleLocked}
            loading={updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
          >
            Save permissions
          </Button>
        </Space>

        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {groupedOptions.map((module) => {
            const moduleKeys = module.permissions.map((permission) => permission.key);
            const moduleCheckedCount = moduleKeys.filter((key) => checkedPermissions.includes(key)).length;
            return (
              <div key={module.module}>
                <Space style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Typography.Title level={5} style={{ margin: 0 }}>{module.moduleLabel}</Typography.Title>
                  <Space>
                    <Tag>{moduleCheckedCount}/{moduleKeys.length}</Tag>
                    {!roleLocked && (
                      <>
                        <Button size="small" onClick={() => setCheckedPermissions(Array.from(new Set([...checkedPermissions, ...moduleKeys])))}>
                          Select module
                        </Button>
                        <Button size="small" onClick={() => setCheckedPermissions(checkedPermissions.filter((key) => !moduleKeys.includes(key)))}>
                          Clear module
                        </Button>
                      </>
                    )}
                  </Space>
                </Space>
                <Checkbox.Group
                  value={checkedPermissions.filter((key) => moduleKeys.includes(key))}
                  options={module.options}
                  onChange={(values) => {
                    const nextModuleValues = values.map(String);
                    setCheckedPermissions([
                      ...checkedPermissions.filter((key) => !moduleKeys.includes(key)),
                      ...nextModuleValues,
                    ]);
                  }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: 12,
                  }}
                  disabled={roleLocked}
                />
                <Divider style={{ margin: '16px 0 0' }} />
              </div>
            );
          })}
        </Space>
      </Space>

      <Modal
        title="New role"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={(values) => createMutation.mutate(values)}>
          <Form.Item label="Role name" name="name" rules={[{ required: true, min: 2, max: 80 }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="Clone permissions from" name="cloneFromRoleId">
            <Select
              allowClear
              placeholder="Start empty"
              options={activeRoles.map((role) => ({ value: role.id, label: role.name }))}
            />
          </Form.Item>
          <Form.Item label="Reason" name="reason">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Rename / describe role"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={() => editForm.submit()}
        confirmLoading={editMutation.isPending}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={(values) => editMutation.mutate(values)}>
          <Form.Item label="Role name" name="name" rules={[{ required: true, min: 2, max: 80 }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="Reason" name="reason">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
