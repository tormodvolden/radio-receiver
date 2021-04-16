#ifndef FWAPP_UAC_H
#define FWAPP_UAC_H

#include <libopencm3/usb/usbd.h>

extern const struct usb_iface_assoc_descriptor g_uac_iface_assoc_dsc;
extern const struct usb_interface_descriptor g_uac_iface_control_dsc;
extern const struct usb_interface_descriptor g_uac_iface_stream_dsc;

void fwapp_uac_setup(usbd_device *dev);

#endif // FWAPP_UAC_H
