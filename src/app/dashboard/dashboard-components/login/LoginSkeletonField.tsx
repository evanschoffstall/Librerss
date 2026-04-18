import { Skeleton } from "@/components/ui/skeleton";

interface LoginSkeletonFieldProps {
  inputWidth?: string;
  labelWidth: string;
}

/**
 * @param root0
 * @param root0.inputWidth
 * @param root0.labelWidth
 */
export function LoginSkeletonField({
  inputWidth = "w-full",
  labelWidth,
}: LoginSkeletonFieldProps) {
  return (
    <div className="space-y-1.5">
      <Skeleton
        className={`
          h-3
          ${labelWidth}
          rounded-full
        `}
      />
      <Skeleton
        className={`
          h-9
          ${inputWidth}
          rounded-md
        `}
        data-login-skeleton-input="true"
      />
    </div>
  );
}
