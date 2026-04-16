import { Skeleton } from "@/components/ui/skeleton";

interface LoginSkeletonFieldProps {
  inputWidth?: string;
  labelWidth: string;
}

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
