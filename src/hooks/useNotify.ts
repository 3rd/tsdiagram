import { useEffect } from "react";
import toast from "react-hot-toast";

interface Props {
  message: string;
  type: "error" | "success";
}

export const useNotify = ({ message, type }: Props) => {
  useEffect(() => {
    if (message) {
      toast[type](message);
    }
  }, [message, type]);
};
