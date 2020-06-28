# Use gphoto compatible camera as v4l device:

```
gphoto2 --stdout --capture-movie | /usr/bin/ffmpeg -i - -vcodec rawvideo -pix_fmt yuv420p -threads 0 -f v4l2 /dev/video2
```
