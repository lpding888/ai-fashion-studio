'use client';
/* eslint-disable @next/next/no-img-element */

import { motion } from 'framer-motion';

const images = [
    "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?q=80&w=1887&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1509631179647-0177331693ae?q=80&w=1888&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=2070&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?q=80&w=1887&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1549298916-b41d501d3772?q=80&w=2012&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=2020&auto=format&fit=crop",
];

export function InspirationGallery() {
    return (
        <div className="w-full overflow-hidden py-10 bg-transparent opacity-80">
            <div className="flex gap-6 animate-scroll mask-image-gradient">
                {/* Duplicate list for seamless loop */}
                {[...images, ...images, ...images].map((src, i) => (
                    <motion.div
                        key={i}
                        whileHover={{ scale: 1.05, filter: 'brightness(1.1)' }}
                        className="flex-shrink-0 w-[200px] h-[300px] rounded-xl overflow-hidden cursor-pointer shadow-lg border border-white/10"
                    >
                        <img
                            src={src}
                            alt={`Inspiration ${i}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 hover:opacity-100 transition-opacity flex items-end p-4">
                            <span className="text-white text-xs font-medium tracking-wider">REMIX THIS</span>
                        </div>
                    </motion.div>
                ))}
            </div>
            <style jsx>{`
        .animate-scroll {
          animation: scroll 40s linear infinite;
        }
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
        </div>
    );
}
