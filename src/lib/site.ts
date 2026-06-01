/** روابط ثابتة — يمكن تجاوز GitHub عبر NEXT_PUBLIC_GITHUB_URL */
export const site = {
  github:
    process.env.NEXT_PUBLIC_GITHUB_URL?.trim() || "https://github.com/AbdAlm10",
  instagram: "https://instagram.com/AbdAlm10",
} as const;
