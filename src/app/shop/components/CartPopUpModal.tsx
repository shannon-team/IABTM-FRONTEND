import Image from "next/image";
import Link from "next/link";
import { useAuthStore } from "@/storage/authStore";
import { useRouter } from "next/navigation";
import { toast } from 'react-toastify';

interface CartPopupProps {
  title: string;
  price: string;
  imageUrl: string;
  onClose: () => void;
}

export default function CartPopup({ title, price, imageUrl, onClose }: CartPopupProps) {
  const { user } = useAuthStore();
  const router = useRouter();

  const handleProceedToCheckout = () => {
    if (!user) {
      toast.info('Please sign in to proceed to checkout');
      router.push('/sign-in');
      onClose();
      return;
    }
    router.push('/cart');
    onClose();
  };

  return (
    <>
      {/* Overlay that dims the screen */}
      <div className="fixed inset-0 bg-opacity-10 backdrop-blur-xs z-40 pointer-events-auto transition-opacity duration-300"></div>

      {/* Popup content */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div className="bg-white rounded-lg shadow-xl w-[90%] max-w-md p-5 relative pointer-events-auto">
          <button
            className="absolute top-2 right-2 text-gray-400 hover:text-black text-xl"
            onClick={onClose}
          >
            ✕
          </button>
          <h2 className="text-lg font-semibold mb-4">Added to cart</h2>
          <div className="flex items-start gap-4 mb-4">
            <div className="w-16 h-16 relative flex-shrink-0">
              <Image
                src={imageUrl}
                alt={title}
                fill
                className="rounded object-cover"
              />
            </div>
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="text-sm font-semibold mt-1">${price}</p>
            </div>
          </div>
          <div className="flex justify-between gap-2">
            <button
              onClick={onClose}
              className="flex-1 border border-gray-300 rounded-full py-2 text-sm hover:bg-gray-100"
            >
              Continue shopping
            </button>
            <button
              onClick={handleProceedToCheckout}
              className="flex-1 bg-black text-white rounded-full py-2 text-sm hover:bg-gray-800"
            >
              Proceed to checkout
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
