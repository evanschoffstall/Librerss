"use client";

import React from "react";
import Motion from "@/app/shared/components/Motion";

export default function Landing() {
  return (
    <div className="text-center">
      <Motion variant={"fadeInDown"}><p className="luxury-title mt-28">Libre</p></Motion>
      <Motion variant={"fadeInDown"}><p className="luxury-title-cap-adjusted mb-16">RSS</p></Motion>
      <Motion variant={"fadeInUp"} transition={{ duration: 2, delay: 1.5 }}>
        <div className="luxury-subtitle mb-24">
          Reviving the
          <br />
          free cloud
          <br />
          tradition
        </div>
      </Motion>
      <Motion variant={"fadeInRight"} transition={{ duration: 2, delay: 2.5 }}>
        <h3 className="py-2 mb-16">
          Free
          <br />
          Open Source
          <br />
          Modern
          <br />
          Service
          <br />
          Reader
          <br />
          No Ads
        </h3>
      </Motion>
      <Motion variant={"fadeIn"} transition={{ duration: 2, delay: 3 }} className="px-20">
        <p className="py-4">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod
          tempor incididunt ut labore et dolore magna aliqua. At imperdiet dui
          accumsan sit amet nulla facilisi morbi. Nunc pulvinar sapien et ligula
          ullamcorper. Laoreet id donec ultrices tincidunt arcu non. Lectus magna
          fringilla urna porttitor rhoncus dolor purus non enim. Ornare arcu dui
          vivamus arcu felis bibendum ut. Vel risus commodo viverra maecenas
          accumsan lacus vel facilisis volutpat. Purus in mollis nunc sed id
          semper risus. Eget velit aliquet sagittis id consectetur purus ut
          faucibus. Gravida dictum fusce ut placerat. Integer vitae justo eget
          magna fermentum iaculis eu non. Donec pretium vulputate sapien nec.
          Fermentum et sollicitudin ac orci. Dapibus ultrices in iaculis nunc.
        </p>
        <p className="py-4">
          Leo in vitae turpis massa. At risus viverra adipiscing at. Fringilla est
          ullamcorper eget nulla facilisi etiam dignissim. Sed viverra tellus in
          hac habitasse. Dapibus ultrices in iaculis nunc sed augue lacus.
          Volutpat est velit egestas dui id ornare arcu odio ut. Penatibus et
          magnis dis parturient. Diam ut venenatis tellus in metus. Diam vel quam
          elementum pulvinar. Ac tortor vitae purus faucibus ornare suspendisse.
          Egestas dui id ornare arcu odio ut sem nulla pharetra. Sem integer vitae
          justo eget magna fermentum. Imperdiet dui accumsan sit amet nulla
          facilisi morbi. Lacus vel facilisis volutpat est velit egestas. Volutpat
          ac tincidunt vitae semper quis lectus nulla at volutpat. Ultrices eros
          in cursus turpis massa tincidunt dui ut ornare. Egestas fringilla
          phasellus faucibus scelerisque.
        </p>
        <p className="py-4">
          Amet nulla facilisi morbi tempus iaculis urna. Platea dictumst
          vestibulum rhoncus est. Eget aliquet nibh praesent tristique magna.
          Pretium lectus quam id leo. Enim sed faucibus turpis in eu mi bibendum.
          Vel elit scelerisque mauris pellentesque pulvinar pellentesque habitant.
          Erat imperdiet sed euismod nisi porta lorem mollis. Integer enim neque
          volutpat ac tincidunt vitae semper quis lectus. Gravida cum sociis
          natoque penatibus et magnis. Non nisi est sit amet facilisis magna. Arcu
          bibendum at varius vel pharetra vel turpis nunc eget. Ultrices sagittis
          orci a scelerisque purus semper eget.
        </p>
      </Motion>
    </div>
  );
}
