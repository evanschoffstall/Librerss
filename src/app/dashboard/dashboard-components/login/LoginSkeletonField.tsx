import { Skeleton } from "@/components/ui/skeleton";

/**
 * Describes the props for the login skeleton field component.
 */
interface LoginSkeletonFieldProps {
  inputWidth?: string;
  labelWidth: string;
}

/**
 * Render the login skeleton field component.
 * @param props - The component props.
 * @returns The rendered login skeleton field component.
 */
export function LoginSkeletonField(props: LoginSkeletonFieldProps) {
  const { inputWidth = "w-full", labelWidth } = props;
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
