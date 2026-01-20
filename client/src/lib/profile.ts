export interface ProfileIdentity {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export function getProfileDisplayName(user?: ProfileIdentity | null): string {
  const firstName = user?.firstName?.trim() ?? "";
  const lastName = user?.lastName?.trim() ?? "";
  const fullName = `${firstName} ${lastName}`.trim();

  if (fullName) {
    return fullName;
  }

  return user?.email?.trim() || "User";
}

export function getProfileInitials(user?: ProfileIdentity | null): string {
  const firstInitial = user?.firstName?.trim()?.[0] ?? "";
  const lastInitial = user?.lastName?.trim()?.[0] ?? "";
  const initials = `${firstInitial}${lastInitial}`.trim();

  if (initials) {
    return initials.toUpperCase();
  }

  const emailInitial = user?.email?.trim()?.[0];
  return (emailInitial || "U").toUpperCase();
}
