from PIL import Image

f = Image.open('screenshots/fist_thumb_clasp1_front.png')
# Hand is around (750, 480)
# Let's crop (600, 350, 1000, 750)
c1 = f.crop((600, 350, 1000, 750))
c1.save('screenshots/clasp1_front_crop.png')

s = Image.open('screenshots/fist_thumb_clasp1_side.png')
c2 = s.crop((600, 350, 1000, 750))
c2.save('screenshots/clasp1_side_crop.png')

full = Image.open('screenshots/fist_thumb_clasp1_full.png')
full.save('screenshots/clasp1_full.png')
print('Cropped clasp1 images saved')

