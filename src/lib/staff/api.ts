import { apiUrl } from '../apiUrl'
import { parseApiResponse } from '../parseApiResponse'
import { buildOrgAuthHeaders } from '../subscription/authHeaders'
import type { StaffProfile } from '../../auth/types'

export type RemoteStaffProfile = {
  id: string
  displayName: string
  initials: string
  role: StaffProfile['role']
  storeId?: string | null
  active: boolean
  permissionOverrides?: StaffProfile['permissionOverrides']
  customRoleId?: string | null
}

export async function fetchRemoteStaff(): Promise<RemoteStaffProfile[]> {
  const res = await fetch(apiUrl('/org/staff'), {
    headers: buildOrgAuthHeaders({ Accept: 'application/json' }),
  })
  const data = await parseApiResponse<{ staff: RemoteStaffProfile[] }>(res)
  return data.staff
}

export async function createRemoteStaff(input: {
  profileId?: string
  displayName: string
  role: StaffProfile['role']
  storeId?: string
  pin: string
  password?: string
  permissionOverrides?: StaffProfile['permissionOverrides']
  customRoleId?: string | null
}): Promise<RemoteStaffProfile> {
  const res = await fetch(apiUrl('/org/staff'), {
    method: 'POST',
    headers: buildOrgAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  })
  return parseApiResponse(res)
}

export async function updateRemoteStaff(
  profileId: string,
  patch: Partial<{
    displayName: string
    role: StaffProfile['role']
    storeId: string | null
    pin: string
    password: string | null
    active: boolean
    permissionOverrides: StaffProfile['permissionOverrides'] | null
    customRoleId: string | null
  }>,
): Promise<RemoteStaffProfile> {
  const res = await fetch(apiUrl(`/org/staff/${encodeURIComponent(profileId)}`), {
    method: 'PATCH',
    headers: buildOrgAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(patch),
  })
  return parseApiResponse(res)
}

export async function deleteRemoteStaff(profileId: string): Promise<void> {
  const res = await fetch(apiUrl(`/org/staff/${encodeURIComponent(profileId)}`), {
    method: 'DELETE',
    headers: buildOrgAuthHeaders(),
  })
  await parseApiResponse(res)
}

export async function verifyRemoteStaffPin(
  profileId: string,
  secret: string,
): Promise<boolean> {
  const res = await fetch(apiUrl('/org/staff/verify'), {
    method: 'POST',
    headers: buildOrgAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ profileId, secret }),
  })
  const data = await parseApiResponse<{ ok: boolean }>(res)
  return data.ok
}

export async function fetchOrgBackup(): Promise<unknown> {
  const res = await fetch(apiUrl('/org/backup'), {
    headers: buildOrgAuthHeaders({ Accept: 'application/json' }),
  })
  return parseApiResponse(res)
}
