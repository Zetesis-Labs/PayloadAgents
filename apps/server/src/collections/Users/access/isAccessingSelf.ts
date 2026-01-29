import type { TypedUser } from 'payload';

export const isAccessingSelf = ({ id, user }: { user?: TypedUser | null; id?: string | number }): boolean => {
  return user ? Boolean(user.id === id) : false
}
