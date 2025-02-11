#include "fwapp.h"
#include "fwapp_hid.h"
#include "fwapp_uac.h"
#include "fwapp_usb.h"

#include <libopencm3/stm32/gpio.h>

#include <stddef.h> // for NULL
#include <stdio.h> // for printf
#include <string.h> // for memset

static usbd_device *m_dev = NULL;
static uint8_t m_control_buffer[USB_CONTROL_BUFFER_LENGTH] = {0};

static fwapp_usb_sof_cb m_sof_cbs[USB_SOF_CALBACKS_COUNT] = {0};

static const struct usb_device_descriptor m_dev_dsc = {
    .bLength = USB_DT_DEVICE_SIZE,
    .bDescriptorType = USB_DT_DEVICE,
    .bcdUSB = USB_BCD_2,
    .bDeviceClass = USB_CLASS_MISC,
    .bDeviceSubClass = USB_SUBCLASS_COMMON,
    .bDeviceProtocol = USB_PROTOCOL_IAD,
    .bMaxPacketSize0 = USB_MAX_EP0_SIZE,
    .idVendor = USB_VENDOR_ID,
    .idProduct = USB_PRODUCT_ID,
    .bcdDevice = USB_BCD_2,
    .iManufacturer = USB_MANUFACTURER_STRING_IDX,
    .iProduct = USB_PRODUCT_STRING_IDX,
    .iSerialNumber = USB_SERIALNUM_STRING_IDX,
    .bNumConfigurations = USB_CONFIGURATIONS_NUMBER
};

static const struct usb_interface m_ifaces[USB_INTERFACES_NUMBER] = {
    {
        .num_altsetting = 1,
        .altsetting = &g_hid_iface_dsc
    },
    {
        .num_altsetting = 1,
        .iface_assoc = &g_uac_iface_assoc_dsc,
        .altsetting = &g_uac_iface_control_dsc
    },
    {
        .num_altsetting = 2,
        .cur_altsetting = &g_uac_stream_iface_cur_altsetting,
        .altsetting = g_uac_iface_stream_dscs
    }
};

static const struct usb_config_descriptor m_config_dsc = {
    .bLength = USB_DT_CONFIGURATION_SIZE,
    .bDescriptorType = USB_DT_CONFIGURATION,
    .wTotalLength = 0,
    .bNumInterfaces = USB_INTERFACES_NUMBER,
    .bConfigurationValue = USB_CONFIGURATION_VALUE,
    .iConfiguration = USB_CONFIG_STRING_IDX,
    .bmAttributes = USB_CONFIG_ATTR_DEFAULT,
    .bMaxPower = USB_MAX_POWER,

    .interface = m_ifaces
};

static const char *m_strings[USB_STRINGS_NUMBER] = {
    "Denis Shienkov", // Manufacturer string.
    "SI4730 AM/FM Radio Receiver", // Product string.
    "12345678", // Serial number string.
    "SI4730 AM/FM Radio Receiver Configuration", // Configuration string.
    "SI4730 AM/FM Radio Receiver HID Control", // Control string.
    "SI4730 AM/FM Radio Receiver Audio Assoc", // Audio association string.
    "SI4730 AM/FM Radio Receiver Audio Control", // Audio control string.
    "SI4730 AM/FM Radio Receiver Audio Stream", // Audio stream string.
};

static void fwapp_usb_reenumerate(void)
{
    // This is a somewhat common cheap hack to trigger device re-enumeration
    // on startup. Assuming a fixed external pullup on D+, (For USB-FS)
    // setting the pin to output, and driving it explicitly low effectively
    // "removes" the pullup.  The subsequent USB init will "take over" the
    // pin, and it will appear as a proper pullup to the host.
    // The magic delay is somewhat arbitrary, no guarantees on USBIF
    // compliance here, but "it works" in most places.

    gpio_set_mode(GPIOA, GPIO_MODE_OUTPUT_2_MHZ,
                  GPIO_CNF_OUTPUT_PUSHPULL, GPIO12);
    gpio_clear(GPIOA, GPIO12);

    fwapp_delay_cycles(800000);
}

static void fwapp_usb_set_config_occurred(usbd_device *dev, uint16_t wValue)
{
    (void)wValue;

    fwapp_hid_setup(dev);
    fwapp_uac_setup(dev);
}

static void fwapp_usb_set_altsetting_occurred(usbd_device *dev, uint16_t wIndex, uint16_t wValue)
{
    fwapp_uac_handle_set_altsetting(dev, wIndex, wValue);
}

static void fwapp_usb_sof_occurred(void)
{
    for (uint8_t i = 0; i < USB_SOF_CALBACKS_COUNT; ++i) {
        if (m_sof_cbs[i])
            m_sof_cbs[i]();
    }
}

static void fwapp_usb_setup(void)
{
    m_dev = usbd_init(
        &st_usbfs_v1_usb_driver,
        &m_dev_dsc,
        &m_config_dsc,
        m_strings,
        USB_STRINGS_NUMBER,
        m_control_buffer,
        sizeof(m_control_buffer));

    usbd_register_set_config_callback(
        m_dev,
        fwapp_usb_set_config_occurred);

    usbd_register_set_altsetting_callback(
        m_dev,
        fwapp_usb_set_altsetting_occurred);

    usbd_register_sof_callback(
        m_dev,
        fwapp_usb_sof_occurred);
}

void fwapp_usb_start(void)
{
    memset(m_sof_cbs, 0, sizeof(m_sof_cbs));
    fwapp_usb_reenumerate();
    fwapp_usb_setup();
}

void fwapp_usb_stop(void)
{
    // TODO: Implement me.
}

void fwapp_usb_schedule(void)
{
    usbd_poll(m_dev);
}

void fwapp_usb_dump_setup_req(struct usb_setup_data *req)
{
    printf(" - usb: %02x-%02x-%04x-%04x-%04x\n",
           req->bmRequestType, req->bRequest,
           req->wIndex, req->wLength, req->wValue);
}

bool fwapp_usb_register_sof_callback(fwapp_usb_sof_cb sof_cb)
{
    if (!sof_cb)
        return false;
    for (uint8_t i = 0; i < USB_SOF_CALBACKS_COUNT; ++i) {
        if (m_sof_cbs[i] && (m_sof_cbs[i] == sof_cb))
            return true;
        if (!m_sof_cbs[i]) {
            m_sof_cbs[i] = sof_cb;
            return true;
        }
    }
    return false;
}
