/**
 * Noms de rôles — canoniques, une seule source de verite.
 *
 * Ces constantes sont importées partout où un nom de rôle doit être comparé,
 * afin d'éviter les chaînes magiques dupliquées et les fautes de frappe.
 */
export const ROLE_PLATFORM_MANAGER  = 'Platform Manager'   as const;
export const ROLE_SUPER_ADMIN        = 'Super Administrateur'   as const;
export const ROLE_ADMIN              = 'Administrateur'         as const;
export const ROLE_MANAGER_MAGASIN    = 'Manager Magasin'       as const;
export const ROLE_OPERATEUR          = 'Opérateur'              as const;
export const ROLE_CAISSIER           = 'Caissier'               as const;
