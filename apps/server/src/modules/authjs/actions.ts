'use server'

import { signIn } from './plugins'

export const signInAction = async () => {
  await signIn('keycloak')
}
